// This file will contain a CyberChef module that can be used to snappy decode input data


/**
 * @author GCHQ Contributor [426]
 * @copyright Crown Copyright 2021
 * @license Apache-2.0
 */

import Operation from "../Operation.mjs";
import OperationError from "../errors/OperationError.mjs";
import Snappy from "../lib/Snappy.mjs";  // need to add this file

/**
 * Protobuf Encode operation
 */
class ProtobufEncode extends Operation {

    /**
     * ProtobufEncode constructor
     */
    constructor() {
        super();

        this.name = "Protobuf Encode";
        this.module = "Protobuf";
        this.description = "Encodes a valid JSON object into a protobuf byte array using the input .proto schema.";
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

export default ProtobufEncode;
