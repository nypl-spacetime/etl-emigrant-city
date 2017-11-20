const fs = require('fs')
const path = require('path')
const got = require('got')
const H = require('highland')
const gunzip = require('gunzip-maybe')
const tar = require('tar-stream')

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

function transform (config, dirs, tools, callback) {
  H(fs.createReadStream(path.join(dirs.download, 'records.ndjson')))
    .split()
    .compact()
    .map(JSON.parse)
    .filter((record) => record.export_document)
    .map((record) => {
      const images = record.subjects && record.subjects[0] && record.subjects[0].location

      const uuids = {
        capture: record.meta_data.capture_uuid,
        page: record.meta_data.page_uri,
        book: record.meta_data.book_uri
      }

      const fields = getFields(record.export_document.export_fields)

      const object = {
        id: record.id,
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
          ...fields
        }
      }

      return {
        type: 'object',
        obj: object
      }
    })
    .compact()
    .flatten()
    .map(H.curry(tools.writer.writeObject))
    .nfcall([])
    .series()
    .stopOnError(callback)
    .done(callback)
}

// ==================================== Steps ====================================

module.exports.steps = [
  download,
  transform
]
