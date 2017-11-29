const fs = require('fs')
const path = require('path')
const got = require('got')
const H = require('highland')
const gunzip = require('gunzip-maybe')
const tar = require('tar-stream')
const Geocoder = require('@spacetime/nyc-historical-geocoder')

const LATEST_DATA_URL = 'http://emigrantcity.nypl.org/data/latest'

function streamToString (stream, callback) {
  const chunks = []
  stream.on('data', (chunk) => {
    chunks.push(chunk.toString())
  })
  stream.on('error', callback)
  stream.on('end', () => {
    callback(null, chunks.join(''))
  })
}

const FIELDS = {
  'Mortgager': 'mortgager',
  'Street Address': 'address',
  'Record Date': 'date',
  'Amount Loaned': 'amountLoaned',
  'Valuation': 'valuation',
  'Record Number': 'recordNumber',
  'Land & Building Dimensions': 'dimensions',
  'Stories & Materials': 'properties',
  'Additional Info': 'additionalInfo'
}

const FIELD_TRANSFORMATIONS = {
  date: (value) => value && value.split('T')[0],
  dimensions: (value) => ({
    land: value.em_survey_land_dimensions,
    building: value.em_survey_building_dimensions
  }),
  properties: (value) => ({
    stories: value.em_record_stories ? value.em_record_stories : undefined,
    material: value.em_record_material
  })
}

function transformField (field, value) {
  if (FIELD_TRANSFORMATIONS[field]) {
    return FIELD_TRANSFORMATIONS[field](value)
  } else if (value) {
    return value
  }
}

function getFields (fields) {
  return fields.reduce((result, field) => {
    const key = FIELDS[field.name]

    if (key) {
      const value = transformField(key, field.value)
      if (value) {
        if (result.key) {
          return Object.assign(result, {
            [key]: [
              result.key,
              value
            ]
          })
        } else {
          return Object.assign(result, {
            [key]: value
          })
        }
      } else {
        return result
      }
    } else {
      return result
    }
  }, {})
}

function download (config, dirs, tools, callback) {
  let error = false
  const recordsStream = H()

  recordsStream
    .pipe(fs.createWriteStream(path.join(dirs.current, 'records.ndjson')))

  const extract = tar.extract()

  got.stream(LATEST_DATA_URL)
    .pipe(gunzip())
    .pipe(extract)

  extract.on('entry', (header, stream, next) => {
    if (error) {
      return
    }

    streamToString(stream, (err, str) => {
      if (err) {
        callback(err)
        error = true
        return
      }

      if (str.length) {
        const record = JSON.parse(str)
        recordsStream.write(`${JSON.stringify(record)}\n`)
      }
    })

    stream.on('end', next)
    stream.on('error', callback)
    stream.resume()
  })

  extract.on('finish', callback)
}

function geocode (config, dirs, tools, callback) {
  // Initialize geocoder
  const geocoderConfig = {
    datasetDir: dirs.getDir(null, 'transform')
  }

  Geocoder(geocoderConfig)
    .then((geocoder) => {
      let count = 1

      H(fs.createReadStream(path.join(dirs.previous, 'records.ndjson')))
        .split()
        .compact()
        .map(JSON.parse)
        .filter((record) => record.export_document)
        .map((record) => {
          if (count % 1000 === 0) {
            console.log(`    Geocoded ${count} records`)
          }

          count += 1

          const fields = getFields(record.export_document.export_fields)

          // Geocode fields.address
          let geocoded
          if (fields.address) {
            try {
              const result = geocoder(fields.address)
              geocoded = {
                found: true,
                result
              }
            } catch (err) {
              geocoded = {
                found: false,
                error: err.message
              }
            }
          }

          return {
            ...record,
            fields,
            geocoded
          }
        })
        .map(JSON.stringify)
        .intersperse('\n')
        .pipe(fs.createWriteStream(path.join(dirs.current, 'records.ndjson')))
        .on('finish', callback)
    })
    .catch(callback)
}

function transform (config, dirs, tools, callback) {
  H(fs.createReadStream(path.join(dirs.previous, 'records.ndjson')))
    .split()
    .compact()
    .map(JSON.parse)
    .filter((record) => record.export_document)
    .map((record) => {
      const id = record.id
      const images = record.subjects && record.subjects[0] && record.subjects[0].location
      const fields = record.fields

      const uuids = {
        capture: record.meta_data.capture_uuid,
        page: record.meta_data.page_uri,
        book: record.meta_data.book_uri
      }

      let geometry
      let relation
      let log
      let addressId
      if (record.geocoded && record.geocoded.found) {
        addressId = record.geocoded.result.properties.address.id
        geometry = record.geocoded.result.geometry

        relation = {
          type: 'relation',
          obj: {
            from: id,
            to: addressId,
            type: 'st:in'
          }
        }
      } else if (record.geocoded && record.geocoded.error) {
        log = {
          type: 'log',
          obj: {
            id,
            error: record.geocoded.error
          }
        }
      }

      const object = {
        type: 'object',
        obj: {
          id,
          type: 'st:Document',
          name: [
            fields.mortgager,
            fields.address
          ].join(' - '),
          validSince: fields.date,
          validUntil: fields.date,
          data: {
            images,
            uuids,
            ...fields,
            addressId
          },
          geometry
        }
      }

      return [
        object,
        relation,
        log
      ]
    })
    .flatten()
    .compact()
    .map(H.curry(tools.writer.writeObject))
    .nfcall([])
    .series()
    .stopOnError(callback)
    .done(callback)
}

// ==================================== Steps ====================================

module.exports.steps = [
  download,
  geocode,
  transform
]
