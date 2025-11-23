# grib2json
This is not @cambecc/grib2json.  Here we have a python version, and a pure
javascript (why are you making that face?) version that even sometimes works.
These two programs were written as adjuncts to [Leaflet-WeatherLayer](...) 
\(which hasn't been posted to github yet).

## Usage
Python version
```bash
python3 grib2json.py input.grb output.json
```

```javascript
// Javascript version(s)
<script src="grib2json.js"></script>
//or
import grib2json from './grib2json.mjs';

let grib;
try {
    grib = await grib2json('input.grb');
} catch(e) {
    console.error(`${e.name} ${e.message}`);
}
console.log(grib);
```

## What's a GRIB?
The [WMO](https://wmo.int) ( World Meteorological Organization ), in cooperation the [ECMWF](https://www.ecmwf.int) \(European Centre for Medium Range Weather Forecasting) developed the GRIB \(**GRI**dded **B**inary ) format as a way to store and interchange weather and climate data.  Tools to manipulate it are generally fairly complicated.  There are a number of web map plugsins that display environmentatal data (winds, temperature, aerosol density, etc) for just about every web map suite (Google maps, OpenLayers, Leaflet, etc).  They pretty much all ingest data in the format produced by @cambecc's tool.  

## So why not just use @cambecc's tool
Because it's written in Java, which I find hard to set up on Windows, java is either forbidden or strongly discouraged in many government and corporate environments, and java runs like a snail on embedded systems and old Raspberry Pi's.  Offloading the processing to the browser makes a lot of sense in environments like that.  The python version was written because most people these days prefer python to java.

## OK, then how do you parse a GRIB?
GRIB files are comprised of 1 or more __messages__ which in turn are comprised of numbered __sections__.  The sections are:<br />
[Section 1](#section-1) \(Identification Section)
[Section 2](#section-2) \(Local Use Section)
[Section 3](#section-3) \(Grid Definition Section)
[Section 4](#section-4) \(Product Definition Section)
[Section 5](#section-5) \(Data Representation Section)
[Section 6](#section-6) \(Bitmap Section)
[Section 7](#section-7) \(Data Section)
[Section 8](#section-8) \(End of Message Section) <br/>
Knowing how the sections are layed out, parsing a GRIB with javascript becomes (mostly) a matter of following the recipe.  This javascript version is basically chocolate chip cookies without the chocolate chips or the nuts.  There are several differenct gridding and compressions schemes.  The javascript version handles _one_.  It's (so far) only good enough to parse terrestrial weather GRIB's downloaded from the NCEP.  The python script uses the [eccodes](https://github.com/ecmwf/eccodes) library, which is the WMO reference implementation for parsing GRIB files, so it will handle a wider range of inputs.

## What if I have a GRIB that the javascript won't parse?
Please open an issue that includes a URL to the GRIB, and if you can submit a PR with the fix. 

# License
Both of these scripts are licensed under the [MIT](./LICENSE.md) license.

## Section 0
### Indicator Section

|Octet Number | Content
-----|-------------------------------------------------------|
| 1-4 | '**GRIB**' (literally the string "GRIB") |
| 5-6 | reserved |
| 7   | discipline \(From [Table 0.0](https://codes.ecmwf.int/grib/format/grib2/sections/0/)) |
| 8   | Edition number (2 for GRIB2, which is what we decode) |
| 9-16 | Total length of this message in octets |


## Section 1
### Identification Section
|Octet Number | Content
-----|-------------------------------------------------------|
| 1-4 | section1Length (21 or nn) |
| 5 | numberOfSection |
| 6-7 | centre, Identification of originating/generating centre \(see [Common Code Table C-11](https://www.nco.ncep.noaa.gov/pmb/docs/on388/table0.html)) |
| 8-9 |	subCentre Identification of originating/generating sub-centre \(see [Code Table C](https://www.nco.ncep.noaa.gov/pmb/docs/on388/tablec.html))|
| 10 | tablesVersion (see Code Table 1.0 and Note 1) |
| 11 | localTablesVersion Version of GRIB Local Tables used (see Code Table 1.1 and Note 2) |
| 12 | significanceOfReferenceTime (see Code Table 1.2) |
| 13-14	| year |
| 15 | month |
| 16 | day |
| 17 | hour	|
| 18 | minute |
| 19 | second |
| 20 | productionStatusOfProcessedData \(see [Code Table 1.3](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table1-3.shtml)) |
| 21 | typeOfProcessedData (see [Code Table 1.4](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table1-4.shtml)) |
| 22 - nn | Reserved |


## Section 2
### Local Use Section
|Octet Number | Content
-----|-------------------------------------------------------|
| 1-4 | section2Length  |
| 5 | numberOfSection |
| 6-nn | Local Use \(not examined in grib2json.js) |

## Section 3
### Grid definition
|Octet Number | Content
-----|-------------------------------------------------------|
| 1-4 | section3Length |
| 5 | numberOfSection |
| 6 | Source of grid definition (See [Table 3.0](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table3-0.shtml)) |
| 7-10 | Number of data points |
| 11 | Number of octets for optional list of numbers defining number of points |
| 12 | Interpetation of list of numbers (See Table 3.11) |
| 13-14 | Grid definition template number (See [Table 3.1](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table3-1.shtml)) |
| 15-nn | Grid definition template (See Template 3.N |

#### Grid Definition Template 3.0 (the one we usually expect)
|Octet Number | Content
-----|-------------------------------------------------------|
| 15|  Shape of the Earth (see [Table 3.2](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table3-2.shtml)) |
| 16 | Scale Factor radius of spherical Earth |
| 17-20 | Scale value of radius of spherical Earth |
| 21 | Scale factor of major axis |
| 22-25 | Scale value of major axis |
| 26 | Scale factor of minor axis |
| 27-30 | Scaled value of minor axis |
| 31-34 | Ni - number of points along a parallel |
| 35-38 | Nj - number of points along a meridian |
| 39-42 | Basic angle of the initial production domain |
| 43-46 | Subdivision of basic angle |
| 47-50 | La1 - latitude of first grid point |
| 51-54 | lo1 - longitude of first grid point |
| 55 | Resolution and component flags (see [Table 3.3](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table3-3.shtml) |
| 56-59 | La2 - latitude of last grid point |
| 60-63 | Lo2 - longitude of last grid point |
| 64-67 | Di - i direction increment |
| 68-71 | Dj - j direction increment |
| 72 | Scanning mode flags (see [Table 3.4](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table3-4.shtml)) |
| 73-nn | List of number of points along meridian or parallel |


## Section 4
### Product Definition
|Octet Number | Content
-----|-------------------------------------------------------|
| 1-4 | section4Length |
| 5 | numberOfSection |
| 6-7 | Number of coordinate values after template |
| 8-9 | Product definition template number (See [Table 4.0](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table4-0.shtml)) |
| 10-xx | Product definition template as described in octets 8-9 |
| [xx+1] - nn | Optional list of coordinate (as described in octets 6-7) |
 
#### Product Representation Template 4.2 (Derived forecast, based on all ensemble members at a horizontal level or in a horizontal layer at a point in time)
|Octet Number | Content
-----|-------------------------------------------------------|
| 10 | Parameter category (see Code Table 4.1) |
| 11 | Parameter number (see Code Table 4.2) |
| 12 | Type of generating process (see Code Table 4.3) |
| 13 | Background generating process identifier (defined by originating centre) |
| 14 | Forecast generating process identified (see [Code ON388 Table A]{https://www.nco.ncep.noaa.gov/pmb/docs/on388/tablea.html)) |
| 15-16 | Hours after reference time data cutoff |
| 17 | Minutes after reference time data cutoff |
| 18 | Indicator of unit of time range (see [Code Table 4.4](https://www.nco.ncep.noaa.gov/pmb/docs/on388/tablea.html)) |
| 19-22 | Forecast time in units defined by octet 18 |
| 23 | Type of first fixed surface (see [Code Table 4.5](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table4-5.shtml)) |
| 24 | Scale factor of first fixed surface |
| 25-28 | Scaled value of first fixed surface |
| 29 | Type of second fixed surfaced (see [Code Table 4.5](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table4-5.shtml)) |
| 30 | Scale factor of second fixed surface |
| 31-34 | Scaled value of second fixed surfaces |
| 35 | Derived forecast (see [Code Table 4.7](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table4-7.shtml)) |
| 36 | Number of forecasts in the ensemble |

## Section 5
### Data Representation

|Octet Number | Content
-----|-------------------------------------------------------|
| 1-4 | section5Length |
| 5 | numberOfSection |
| 6-9 | Number of data points |
| 10-11 | Data representation template number (See [Table 5.0](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table5-0.shtml)) |
|12-nn | Data representation template (See Template 5.X) |
 
#### Product Representation Template 5.0 (Grid point data, simple packing)
|Octet Number | Content
-----|-------------------------------------------------------|
| 12-15	| Reference value (R) (IEEE 32-bit floating-point value) |
| 16-17	| Binary scale factor (E) |
| 18-19	| Decimal scale factor (D) |
| 20 | Number of bits used for each packed value for simple packing |
| 21 | Type of original field values (see Code Table 5.1) |
 
For octet 21, a value of zero means float, 1 means integer
If you're going to decode yourself, pay attention to octet 20.  You get some weird stuff, like 14 bit values (which are real fun to unpack).


## Section 6
### Bit-map Section
|Octet Number | Content
-----|-------------------------------------------------------|
| 1-4 | section6Length |
| 5 | numberOfSection |
| 6 | Bit-map indicator (see [Table 6.0](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table6-0.shtml))|
| 7-nn | Bit-map |

#### Table 6.0
| Code Figure | Meaning
-----|-------------------------------------------------------|
| 0	| A bit map applies to this product |
| 1-253 | A bit map pre-determined by the center applies and is NOT specified in this section |
| 254 | A bitmap previously defined the the same GRIB2 message applies |
| 255 | A bit map does not apply to this product |


## Section 7
### Data Section
|Octet Number | Content
-----|-------------------------------------------------------|
| 1-4 | section7Length |
| 5 | numberOfSection |
| 6-nn | Data in a format described by data Template 7.x, where X in given in [section 5](#section-5) octets 10-11 |
### Data Template 7.0 - Grid point data - simple packing
|Octet Number | Content
-----|-------------------------------------------------------|
| 6-nn | Binary data values - binary string, with each (scaled) data value |

## Section 8
### End Section
|Octet Number | Content
-----|-------------------------------------------------------|
| 1-4 | **7777** (literally the string "7777")

## Decoding the coded values in section 7, using Template 5.0
While libraries like [eccodes](https://github.com/ecmwf/eccodes) can decode _all_ the data representations, the typical representation is data coded in n-bit values \(where _n_ is specified in [section 5](#section-5) octet 20), scaled by 3 coefficients which are specified in octets 12-19 of section 5 (if your GRIB is using template 5.0, which in practice most do).  While it's possible to bit-shift the data array to get the n-bit values, our javascript codes uses strings to split the bits, which makes the code much smaller and **WAY** easier to understand, so the slight performance hit in the interests of clarity is a good compromise.

Basically take the octets from octet 6 until the end of section 7, unpack them into values consisting of the number of binary bits specified for that data message, convert them to numbers, scale them, and return the converted values.

Scaling is:<br />
$engineeringValue = \left(R + rawValue * 2^E\right) / 10^D$ <br />
<br />
Where: <br />
R = Refernce Value \(an IEEE 32-bit float found in octets 12-15 of section 5) <br />
E = Binary scale factor \(a signed integer found in octets 16-17 of section 5)<br />
D = Decimal scale factor \(a signed integer found in octets 18-19 of section 5)<br />
__NOTE__: Signed integers in a GRIB typically just mean that the first bit in the bytes is a 1 to indicate a negative integer, not a typical 2's complement signed integer.
