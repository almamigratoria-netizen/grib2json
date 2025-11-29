//
// grib2json.js
//
// Pure javascript implementation of a basic GRIB2 reader.
//
'use strict';

export const grib2json = async function(url) {
    // download the grib
    async function download_grib(url) {
        let grib;
        try {
            const fetch_opts = {
                'x-requested-with': 'fetch',
                origin: document.location.origin,
            }
            const r = await fetch(url, fetch_opts);
            if (!r.ok) {
                const msg = `grib2json: status=${r.status}, url=${r.url}`;
                throw new Error(msg);
            }
            const b = await r.arrayBuffer();
            if (b.length < 10) {
                const msg = `grib2json.js: aborting: grib too short`;
                throw new Error(msg);
            }
            grib = new Uint8Array(b);
        } catch(e) {
            const err = `grib2json.js: ${e.name} ${e.message}`;
            throw new Error(err);
        }
        return grib;
    }

    // GRIB2 files are composed of one or more messages
    function split_raw_messages(grib) {
        const rawMsgs = [];
        let ptr = 0;
        // in each message, the total length of the message is found in
        // octets 9-16 of Section 0 (the first section)
        while (ptr < grib.length) {
            const msgLen = b2i(grib.slice(ptr + 9, ptr + 16));
            const msg = grib.slice(ptr, ptr + msgLen);
            rawMsgs.push(msg);
            ptr += msgLen;
        }
        return rawMsgs;
    }

    // We have to test for section 8 separately, since like section 0 it
    // does not advertise its section number in octet 5 or length.
    function isSection8(bytes) {
        if (String.fromCharCode.apply(String, bytes) == "7777") {
            return true;
        }
        return false;
    }

    // messages are composed of sections, always starting with section 0
    // and ending with section 8, the ones in the middle may or may not
    // be present, and although in practice they are always in order, they 
    // don't need to be
    function split_sections(msg) {
        const sections = [];
        let ptr = 0;
        // Section 0 always has a length of 16;
        sections[0] = msg.slice(0, 16);
        ptr += 16;
        while (ptr < msg.length) {
            // Section 8 (End Section) consists of the literal string "7777"
            if (isSection8(msg.slice(ptr, ptr + 4))) { 
                break;
            }
            // In sections 1-7, the length of section is octets 1-4
            let secLen = b2i(msg.slice(ptr, ptr + 4));
            // In sections 1-7, the numberOfSection is always octet 5
            let secNum = msg[ptr + 4];
            sections[secNum] = msg.slice(ptr, ptr + secLen);
            ptr += secLen;
        }
        return sections;
    }

    // Get the section number.  It's usually in octet 5, except for
    // section 0 and 8, which for some reason are special.  There have
    // been proposals to make them more homogenous in GRIB3, but for legacy 
    // reasons they probably will never change.
    function getSecNum(section) {
        let bytes = section.slice(0, 4);
        let secNum = undefined;
        let test = String.fromCharCode.apply(String, bytes);
        if (test == "GRIB") {
            secNum = 0;
        } else {
            secNum = section[4];  // octet 5 zero based
        }
        return secNum;
    }

    // Parse an individual sections
    function parse_section(section, accumulator) {
        const dispatchTable = {
            0: parse_section0,
            1: parse_section1,
            2: parse_section2,
            3: parse_section3,
            4: parse_section4,
            5: parse_section5,
            6: parse_section6,
            7: parse_section7,
        }
        let newKeys = {};
        let secNum = getSecNum(section);
        if (typeof dispatchTable[secNum] === 'function') {
            let info = dispatchTable[secNum](section, accumulator);
            for (const key of Object.keys(info)) {
                newKeys[key] = info[key];
            }
        } else {
            const err = `grib2json: Unknown section ${secNum}`;
            console.warn(err);
        }
        return newKeys;
    }

    function parse_completed_message(collector, g2j) {
        function isValue(x) {
            if (x!=null && x!=undefined) {
                if (x.value) {
                    return x.value;
                }
                return x;
            }
            return 'unknown' 
        }

        collector.refTime = build_refTime(collector);
        collector.gridUnits = "degrees";  // FIXME:  Try to figure out WTF

        const wanted = [ // extract headers @cambecc/grib2json produces.
            'name', 'parameterName', 'discipline', 'gribEdition', 'center', 
            'subcenter', 'refTime', 'significanceOfRT', 'productStatus',
            'productType', 'productDefinitionTemplate', 'parameterCategory', 
            'parameterNumber', 'parameterUnit', 'genProcessType', 
            'forecastTime', 'surface1Type', 'surface1Value', 'surface2Type', 
            'surface2Value', 'gridDefinitionTemplate', 'numberPoints', 
            'gridUnits', 'resolution', 'winds', 'scanMode', 'nx', 'ny',
            'basicAngle', 'lo1', 'la1', 'lo2', 'la2', 'dx', 'dy',
        ]

        const header = {};
        for (const key of wanted) {
            header[key] = isValue(collector[key]);
        }
        return {
            "header": header,
            "data": collector.data,
        };
    }

    function parse_grib(grib) {
        // Separate the GRIB into individual messages
        // Separate the messages into sections
        // parse the sections
        let ptr = 0;
        let g2j = [];
        const accumulator = {};
        const raw_messages = split_raw_messages(grib);
        for (const raw_msg of raw_messages) {
            const sections = split_sections(raw_msg);
            for (const section of sections) {
                if (!section) continue; 
                const info = parse_section(section, accumulator);
                for (const key of Object.keys(info)) {
                    accumulator[key] = info[key];
                }
            }
            const message = parse_completed_message(accumulator, g2j);
            g2j.push(message);
        }
        return g2j;
    }

    async function download_and_parse_grib(url) {
        let grib;
        if (typeof url === "string") {
            grib = await download_grib(url);
        } else if (url instanceof Uint8Array) {
            grib = url;
        }
        // otherwise let the chips fall where they may
        const g2j = parse_grib(grib);
        return JSON.stringify(g2j, null, 2);
    }

    // either pass a url (to download) or a Uint8Array with the
    // already downloaded GRIB file.
    return await download_and_parse_grib(url);

    // refTime is a value found in the output of @cambecc's grib2json app
    // It might come from the underlying java libraries from UCAR.  Either way,
    // it's a handy field and for compatiblility with @cambecc, we create it.
    //
    // FIXME:  Find out what refTime says when we have multiple forecasts
    //         in a single GRIB file (like saildocs, etc).
    function build_refTime(src) {
        try {
            const refTime = new Date();
            refTime.setFullYear(src.year);
            refTime.setMonth(src.month);
            refTime.setDate(src.day);
            refTime.setHours(src.hour);
            refTime.setMinutes(src.minute);
            refTime.setSeconds(src.seconds);
            refTime.setMilliseconds(0);
            return refTime.toISOString();
        } catch(e) {
            console.warn(`build_refTime: ${e.name} ${e.message}`);
        }
        return "Unknown";
    }

    // bytes to float32
    function b2f(bytes) {
        return new DataView(new Uint8Array(bytes).buffer).getFloat32(0);
    }

    // ROADMAP:  Decide if we ever will get an unsigned interger so 
    //           large that the first bit is set.  That would let us 
    //           just put regulatio 92.1.5 here and eliminate a function.
    // bytes to unsigned integer (1, 2, 4 bytes.. whatever)
    function b2i(bytes) {
        let n = 0;
        for (let i = 0, j = bytes.length ; i < j ; i++) {
            n *= 256;
            n += bytes[i];
        }
        return n;
    }

    // bytes to unsigned integer (1, 2, 4 bytes.. whatever)
    // But with regulation 92.1.5 first bit == 1 means negative number
    // https://apps.ecmwf.int/codes/grib/format/grib2/regulations/
    function b2i9215(bytes) {
        let sign = 1;
        if (bytes[0] & 128) {  // if first bit is set
            bytes[0] &= 127;   // reset it to 0
            sign = -1;         // and call the number negative
        }

        let n = 0;
        for (let i = 0, j = bytes.length ; i < j ; i++) {
            n *= 256;
            n += bytes[i];
        }
        return n * sign;
    }

    ///////////////////////////////////////////////////////////////////////
    //
    //   NOTE about parsing these sections
    //       The documentation on the NCEP and ECMWF websites for GRIB 
    //       sections all reference the number of the octets in ordinal 
    //       terms (the first octet is octet 1).  But most computer 
    //       languages use zero-based indexing (the first octet is octet 0).
    //       So to make it easier to go directly from the docs to the code, 
    //       we prepend a zero element to the array we're passed.   Yes, 
    //       it's less than optimal, but it does improve clarity.
    //
    ///////////////////////////////////////////////////////////////////////

    ///////////////////////////////////////////////////////////////////////
    //
    //    Section 0: Identification Section
    //
    ///////////////////////////////////////////////////////////////////////
    function parse_section0(bytes, sections) {
        bytes = [...new Uint8Array([0]), ...bytes];  // Ordinal fix

        let magic = String.fromCharCode.apply(String, bytes.slice(1, 5));
        //let magic = '';
        //magic = magic + String.fromCharCode(bytes[1]);
        //magic = magic + String.fromCharCode(bytes[2]);
        //magic = magic + String.fromCharCode(bytes[3]);
        //magic = magic + String.fromCharCode(bytes[4]);
        if (magic != "GRIB") {
            const e = `grib2json.js: Probably not a GRIB2 file`;
            console.error(e);
            throw new Error(e);
        }
        return {
            length: 16,                 // section 0 is always 16 bytes
            numberOfSection: 0,
            magic: magic,
            discipline: bytes[7],
            gribEdition: bytes[8],
            lengthOfMessage: b2i(bytes.slice(9, 16)), 
        }
    }


    ///////////////////////////////////////////////////////////////////////
    //
    //    Section 1: Identification Section
    //
    ///////////////////////////////////////////////////////////////////////
    function parse_section1(bytes, sections) {
        const slice = (a, b) => { return bytes.slice(a, b + 1); }
        bytes = [...new Uint8Array([0]), ...bytes];  // Ordinal fix

        return {
            length: b2i(slice(1,4)),
            numberOfSection: bytes[5],
            //https://www.nco.ncep.noaa.gov/pmb/docs/on388/table0.html
            center: b2i(slice(6,7)),
            //https://www.nco.ncep.noaa.gov/pmb/docs/on388/tablec.html
            subcenter: b2i(slice(8,9)),
            gribEdition: bytes[10],
            version: bytes[11],
            // https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table1-2.shtml
            significanceOfRT: bytes[12],
            year: b2i(slice(13,14)),
            month: bytes[15],
            day: bytes[16],
            hour: bytes[17],
            minute: bytes[18],
            productType: bytes[21],
            seconds: bytes[19],
            productStatus: bytes[20],
            productType: bytes[21],
        }
    }


    ///////////////////////////////////////////////////////////////////////
    //
    //    Section 2: Local Use Section
    //        Not used here. Some GRIB's from NOAA's NWS will
    //        use section 2 for local severe weather advisories, but
    //        most GRIB2's you download will not even have a section 2.
    //
    ///////////////////////////////////////////////////////////////////////
    function parse_section2(bytes, sections) {
        const slice = (a, b) => { return bytes.slice(a, b + 1); }
        bytes = [...new Uint8Array([0]), ...bytes];  // Ordinal fix

        return {
            length: b2i(slice(1,4)),
            numberOfSection: bytes[5],
        }
    }


    ///////////////////////////////////////////////////////////////////////
    //
    //    Section 3: Grid Definition Section
    //
    ///////////////////////////////////////////////////////////////////////
    // Dispatch table for gridDefinitionTemplateNumber
    // To add more templates, simply expand this dispatch table

    // gridDefinitionTemplae 0
    function gdT0(bytes) {
        const slice = (a, b) => { return bytes.slice(a, b + 1); }

        const a = {};
        a.shape = bytes[15];
        a.scaleFactorRadius1 = bytes[16];
        a.scaleFactorRadius2 = b2i(slice(17, 20));
        a.nx = b2i(slice(31, 34));
        a.ny = b2i(slice(35, 38));
        a.basicAngle = b2i(slice(39, 42))/10e5;
        a.la1 = b2i9215(slice(47, 50))/10e5;
        a.lo1 = b2i(slice(51, 54))/10e5;
        a.resolution = bytes[55];
        if (bytes[55] & 32) {
            a.winds = "true";
        } else {
            a.winds = "relative";
        }
        a.la2 = b2i9215(slice(56, 59))/10e5;
        a.lo2 = b2i(slice(60, 63))/10e5;
        a.dx = b2i(slice(64, 67))/10e5;
        a.dy = b2i(slice(68, 71))/10e5;
        a.scanMode = bytes[72];
        return a;
    }

    function parse_section3(bytes, sections) {
        const slice = (a, b) => { return bytes.slice(a, b + 1); }
        bytes = [...new Uint8Array([0]), ...bytes];  // Ordinal fix
        const gridDefinitionTemplates = {
            0: gdT0,
        }

        const gDTn = b2i(slice(13, 14));

        const section3 =  {
            length: b2i(slice(1,4)),
            numberOfSection: bytes[5],
            sourceOfGridDefinition: bytes[6],
            numberPoints: b2i(slice(7, 10)),
            numberOfOctets: bytes[11],
            interpretationList: bytes[12],
            gridDefinitionTemplate: gDTn,
        }

        if (typeof gridDefinitionTemplates[gDTn] === 'function') {
            const t = gridDefinitionTemplates[gDTn](bytes);
            for (const key of Object.keys(t)) {
                section3[key] = t[key];
            }
        } else {
            const e = `grib2json.js: can't gridDefinitionTemplate ${gDTn}`;
            console.error(e);
            throw new Error(e);
        }

        return section3;
    }


    ///////////////////////////////////////////////////////////////////////
    //
    //    Section 4: Product Definition Section
    //
    ///////////////////////////////////////////////////////////////////////
    // productDefinitionTable 4.0
    // also suitable (for our purposes) for Template 4.2 
    // https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_temp4-0.shtml
    function pDT0(bytes) {
        const slice = (a, b) => { return bytes.slice(a, b + 1); }

        const a = {
            parameterCategory: bytes[10],
            parameterNumber: bytes[11],
            typeOfGeneratingProcess: bytes[12],
            genProcessType: bytes[13],
            forecastGeneratingProcess: bytes[14],
            hoursAfterReferenceTime: b2i(slice(15, 16)),
            forecastTime: b2i(slice(19,22)),
            surface1Type: bytes[23],
            surface1Value: b2i(slice(25, 28)),
            surface2Type: bytes[29],
            surface2Value: b2i(slice(31, 34)),
        }

        return a;
    }

    function parse_section4(bytes, sections) {
        // Because we're using a dispatch table, the context doesn't
        // let us access things like "products" unless they're in the
        // context (this function)
        const products = {
            // object is quite easily extensible.
            // PRO-${discipline}-${category}-${parameterNumber}
            // Discipline 0 - Meteorology
            //     Category 0 - Temperature
            "PRO-0-0-0":   [ "K", "TMP", "Temperature" ], 
            "PRO-0-0-6":   [ "K", "DPT", "Dew Point Temperature" ], 
            "PRO-0-0-12":  [ "K", "HEATX", "Heat Index" ], 
            "PRO-0-0-13":  [ "K", "WCF", "Wind Chill Factor" ], 
            "PRO-0-1-1":   [ "%", "RH", "Relative Humidity" ],
            "PRO-0-1-3":   [ "kg m-2", "PWAT", "Precipitable Water" ],
            "PRO-0-1-7":   [ "kg m-2 s-1", "PRATE", "Precipitation Rate" ],
            "PRO-0-1-19":  [ "*", "PTYPE", "Precipitation Type" ],
            "PRO-0-1-51":  [ "kg/m-2", "TCWAT", "Total Column Water" ],
            "PRO-0-1-52":  [ "kg/m-2", "TPRATE", "Total Precipitation Rate" ],
            "PRO-0-1-78":  [ "kg/m-2", "TCOLWA", "Total Column Integrated Water" ],
            //     Category 2 - Momentum
            "PRO-0-2-2":   [ "m/s", "UGRD", "U-Component of Wind" ],
            "PRO-0-2-3":   [ "m/s", "VGRD", "V-Component of Wind" ],
            //     Category 3 - Mass
            "PRO-0-3-1":   [ "Pa", "PRMSL", "Pressure Reduced to MSL" ],
            //     Category 4 - Shortwave Radiation (UV, Vis)
            "PRO-0-4-10":  [ "W/m-2", "PHOTAR", "Photosynthetically Active Radiation" ],
            "PRO-0-4-51":  [ "", "UVI", "UV Index" ],
            //     Category 5 - Longwave Radiation (IR)... etc etc...
            //     Category 6 - Cloud
            "PRO-0-6-1":  [ "%", "TCDC", "Total Cloud Cover" ],
            "PRO-0-6-3":  [ "%", "LCDC", "Low Cloud Cover" ],
            "PRO-0-6-4":  [ "%", "MCDC", "Medium Cloud Cover" ],
            "PRO-0-6-5":  [ "%", "HCDC", "High Cloud Cover" ],
            //     Category 6 - Thermodynamic Stability
            "PRO-0-7-6":  [ "J/kg", "CAPE", "Convective Available Potential Energy" ],
            "PRO-0-7-21":  [ "", "SSI", "Storm Severity Index" ],
            "PRO-0-17-192": [ "", "LTNG", "Lightning" ],
            "PRO-0-19-0":  [ "m", "VIS", "Visibility" ],
            "PRO-0-19-25": [ "", "WW", "Weather Interpretation" ],
            // Discipline 1 - Hydrology 
            "PRO-1-1-11":  [ "m", "SNOD", "Snow Depth" ],
            // Discipline 2 - Land Surface Products (land/sea, soil temp, etc)
            // Discipline 3 - Satellite Remote Sensing
            "PRO-3-5-0":   [ "K", "ISSTMP", "Interface Sea Surface Temperture" ],
            "PRO-3-5-1":   [ "K", "SKSSTMP", "Skin Sea Surface Temperature" ],
            // Discipline 10 - Oceanographic Products
            //     Category 0 - Waves
            //     Category 1 - Currents
            "PRO-10-1-2":  [ "m/s", "UOGRG", "U-Component of Current" ],
            "PRO-10-1-3":  [ "m/s", "VOGRD", "V-Component of Current" ],
            // Discipline 19 - Physical atmospheric properties
        }

        const slice = (a, b) => { return bytes.slice(a, b + 1); }
        bytes = [...new Uint8Array([0]), ...bytes];  // Ordinal fix
        // dispatch table for productDefinitionTemplateNumber
        const pDTn_dispatch = {
            0: pDT0,
            2: pDT0,
        }

        const pDTn = b2i(slice(8,9));

        const common =  {
            length: b2i(slice(1,4)),
            numberOfSection: bytes[5],
            numberOfCoordinateValuesAfterTemplate: b2i(slice(6,7)),
            productDefinitionTemplate: pDTn,
        }

        if (typeof pDTn_dispatch[pDTn] === 'function') {
            let a = pDTn_dispatch[pDTn](bytes);
            for (const key of Object.keys(a)) {
                common[key] = a[key];
            }
       } else {
            const e = `grib2json.js: cannot process productDefinitionTemplate ${pDTn}`;
            console.error(e);
            throw new Error(e);
        }

        // get Units, name, parameterName
        let disc = sections.discipline;
        let cat = common.parameterCategory;
        let pNum = common.parameterNumber;
        const pKey = `PRO-${disc}-${cat}-${pNum}`
        const details = products[pKey] || null;
        if (details) {
            common.parameterUnit = details[0] || "unknown";
            common.parameterName = details[1] || "unknown";
            common.name = details[2] || "unknown";
        } 

        return common;
    }
    

    ///////////////////////////////////////////////////////////////////////
    //
    //    Section 5: Data Representation Section
    //        This section tells us how the data is layed out
    //        We currently on handle Template 5.0
    //
    ///////////////////////////////////////////////////////////////////////
    // Data representation template 5.0, grid point data - simple packing
    function dRT0(bytes) {
        const slice = (a, b) => { return bytes.slice(a, b + 1); }

        const a = {
            referenceValue: b2f(slice(12, 15)),
            binaryScaleFactor: b2i9215(slice(16,17)),
            decimalScaleFactor: b2i9215(slice(18,19)),
            nBits: bytes[20],
            typeOfOriginalFieldValues: bytes[21] ? 'int' : 'float',
        }

        return a;
    }

    function parse_section5(bytes, sections) {
        // dispatch table for dataRepresentationTemplateNumber
        const dRTn_dispatch = {
            0: dRT0,
        }

        const slice = (a, b) => { return bytes.slice(a, b + 1); }
        bytes = [...new Uint8Array([0]), ...bytes];  // Ordinal fix

        const dRTn = b2i(slice(10,11));
        const common =  {
            length: b2i(slice(1,4)),
            numberOfSection: bytes[5],
            nPoints: b2i(slice(6, 9)),
            dataRepresentationTemplateNumber: dRTn,
        }

        if (typeof dRTn_dispatch[dRTn] === 'function') {
            let a = dRTn_dispatch[dRTn](bytes);
            for (const key of Object.keys(a)) {
                common[key] = a[key];
            }
        } else {
            const e = `grib2json.js: cannot process dataRepresentationTemplate ${dRTn}`;
            console.error(e);
            throw new Error(e);
        }

        return common;
    }

    ///////////////////////////////////////////////////////////////////////
    //
    //    Section 6: Bitmap Section
    //    (We're currently unable to parse bitmaps)
    //    (Mostly what I've seen bitmaps do is tell you when data
    //     values are null, so no big loss for now)
    //
    ///////////////////////////////////////////////////////////////////////
    function parse_section6(bytes, sections) {
        const slice = (a, b) => { return bytes.slice(a, b + 1); }
        bytes = [...new Uint8Array([0]), ...bytes];  // Ordinal fix

        const bitMapIndicator = bytes[6];
        if (bitMapIndicator != 255) {
            const e = "grib2json.js: may not correctly proecess bitmaps";
            console.warn(e);
        }

        const length = b2i(slice(1, 4));
        let bitMapData = null;
        if (length > 6) {
            bitMapData = slice(7, length);
        }
        return {
            length: length,
            numberOfSection: bytes[5],
            bitMapIndicator: bitMapIndicator,   // see table 6.0
            bitMapData: bitMapData,
        }

        const table6_0 = {
            0: 'A bit map applies to this product and is specified in this section',
            1: '-253  A bit map pre-determined by the originating/generating center applies to this product and is not specified in this section',
            254: 'A bit map previously defined in the same GRIB2 message applies to this product',
            255: 'A bit map does not apply to this product',
        }
    }



    ///////////////////////////////////////////////////////////////////////
    //
    //    Section 7: Data section
    //
    ///////////////////////////////////////////////////////////////////////
    function parse_section7(bytes, sections) {
        const getCodedValues = function (bytes, bitsPerValue, nPoints) {
            // convert all the bytes into a long string of 1's and 0's
            function bytes2bits(bytes) {
                let bits = "";
                for (let i = 0, j = bytes.length ; i < j ; i++) {
                    bits += String(bytes[i].toString(2)).padStart(8, 0);
                }
                return bits;
            }

            const values = [],
                  bitstring = bytes2bits(bytes),
                  last_bit = bitsPerValue * nPoints,
                  R = sections.referenceValue,
                  E = sections.binaryScaleFactor,
                  D = sections.decimalScaleFactor,
                  c1 = Math.pow(2, E),
                  c2 = Math.pow(10, D);
            let index = 0,
                bitMapData = null,
                useBitMap = false,
                dataIndex = 0;

            if (sections.bitMapData && sections.bitMapIndicator == 0) {
                useBitMap = true;
                bitMapData = bytes2bits(sections.bitMapData);
            }
            while (index < last_bit) {
                if (useBitMap && bitMapData[dataIndex] == '0') {
                    values.push(null);
                } else {
                    let nibble = bitstring.slice(index, index + bitsPerValue);
                    let raw_value = Number(`0b${nibble}`);
                    const ev = (R + raw_value * c1) / c2;
                    values.push(Number(ev.toFixed(4)));
                }
                index += bitsPerValue;
                dataIndex++;
            }
            return values;
        }

        const slice = (a, b) => { return bytes.slice(a, b + 1); }
        bytes = [...new Uint8Array([0]), ...bytes];  // Ordinal fix

        const length = b2i(slice(1, 4));

        const common =  {
            length: length,
            numberOfSection: bytes[5],
            // raw_data: slice(6, length);
        }

        const dRTn = sections.dataRepresentationTemplateNumber;
        // Probably should do this with a dispatch table for 
        // consistency with other Sections, but we'll stick
        // with an if/elseif tree for now.
        if (dRTn == 0) {
            const data = slice(6, length);
            const nbits = sections.nBits;
            const nPoints = sections.numberPoints;
            common.data = getCodedValues(data, nbits, nPoints);
        } else {
            const err = `grib2json.js: unable to process dataRepresentationTemplateNumber ${dRTn}`;
            console.error(err);
            throw new Error(err);
        }
        
        return common;
    }

};

export { grib2json as default };
