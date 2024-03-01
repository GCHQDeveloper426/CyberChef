// This file will contain a CyberChef module that can be used to snappy encode input data
/**
 * @author GCHQ Contributor [426]
 * @copyright Crown Copyright 2024
 * @license Apache-2.0
 */

import Operation from "../Operation.mjs";
import OperationError from "../errors/OperationError.mjs";
import Snappy from "../lib/Snappy.mjs";  // need to add this file

/**
 * Snappy Compress operation
 */
class SnappyCompress extends Operation {

    /**
     * SnappyCompress constructor
     */
    constructor() {
        super();

        this.name = "Snappy Compress";
        this.module = "Default";
        this.description = "Snappy Compresses data.";
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
        return Snappy.compress(input);
    }

}

export default SnappyCompress;
