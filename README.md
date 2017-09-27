# Space/Time ETL module: Emigrant City

[ETL](https://en.wikipedia.org/wiki/Extract,_transform,_load) module for NYPL's [NYC Space/Time Direcory](http://spacetime.nypl.org/). This Node.js module downloads, parses, and/or transforms Emigrant City data, and creates a NYC Space/Time Directory dataset.

## Details

<table>
  <tbody>

  <tr>
    <td>ID</td>
    <td><code>emigrant-city</code></td>
  </tr>

  <tr>
    <td>Title</td>
    <td>Emigrant City</td>
  </tr>

  <tr>
    <td>Description</td>
    <td>Emigrant City</td>
  </tr>

  <tr>
    <td>License</td>
    <td>CC0</td>
  </tr>

  <tr>
    <td>Author</td>
    <td>Bert Spaan</td>
  </tr>

  <tr>
    <td>Website</td>
    <td><a href="http://emigrantcity.nypl.org">http://emigrantcity.nypl.org</a></td>
  </tr>
  </tbody>
</table>

## Available steps

  - `download`
  - `transform`

## Usage

```
git clone https://github.com/nypl-spacetime/etl-emigrant-city.git /path/to/etl-modules
cd /path/to/etl-modules/etl-emigrant-city
npm install

spacetime-etl emigrant-city [<step>]
```

See http://github.com/nypl-spacetime/spacetime-etl for information about Space/Time's ETL tool. More Space/Time ETL modules [can be found on GitHub](https://github.com/search?utf8=%E2%9C%93&q=org%3Anypl-spacetime+etl-&type=Repositories&ref=advsearch&l=&l=).

# Data

The dataset created by this ETL module's `transform` step can be found in the [data section of the NYC Space/Time Directory website](http://spacetime.nypl.org/#data-emigrant-city).
