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
        this.module = "Snappy";
        this.description = "Decompresses Snappy compressed data.";
        this.infoURL = "";
        this.inputType = "ArrayBuffer";
        this.outputType = "ArrayBuffer";
        this.args = [];
    }

    /**
     * @param {ArrayBuffer} input
     * @param {Object[]} args
     * @returns {ArrayBuffer}
     */
    run(input, args) {
        return Snappy.decompress(input);
    }

}

export default SnappyDecompress;
