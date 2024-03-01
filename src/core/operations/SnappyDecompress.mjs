// This file will contain a CyberChef module that can be used to snappy decode input data


/**
 * @author GCHQ Contributor [426]
 * @copyright Crown Copyright 2024
 * @license Apache-2.0
 */

import Operation from "../Operation.mjs";
import OperationError from "../errors/OperationError.mjs";
import Snappy from "../lib/Snappy.mjs";  // need to add this file

/**
 * Snappy Decompress operation
 */
class SnappyDecompress extends Operation {

    /**
     * SnappyDecompress constructor
     */
    constructor() {
        super();

        this.name = "Snappy Decompress";
        this.module = "Default";
        this.description = "Decompresses Snappy compressed data.";
        this.infoURL = "";
        this.inputType = "ArrayBuffer";
        this.outputType = "ArrayBuffer";
        this.args = [{
            name: "Delimiter",
            type: "option",
            value: ["Raw", "Framed(sNaPpY)"]
        }];
    }

    /**
     * @param {ArrayBuffer} input
     * @param {Object[]} args
     * @returns {ArrayBuffer}
     */
    run(input, args) {
        const snappy_type = args[0];
        let offset = 0;
        let data = "";
        const buffer = new Uint8Array(input);

        if (snappy_type == "Framed(sNaPpY)") {
            while (offset < buffer.byteLength) {
                [offset, data] = Snappy.stripFrame(buffer, offset);
                return Snappy.uncompress(data);
            }
        } else {
            return Snappy.uncompress(input);
        }
    }
}

export default SnappyDecompress;
