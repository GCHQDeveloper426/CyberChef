/**
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2022
 * @license Apache-2.0
 */

import Operation from "../Operation.mjs";
import lz4 from "lz4js";

/**
 * LZ4 Decompress operation
 */
class LZ4Decompress extends Operation {

    /**
     * LZ4Decompress constructor
     */
    constructor() {
        super();

        this.name = "LZ4 Decompress";
        this.module = "Compression";
        this.description = "LZ4 is a lossless data compression algorithm that is focused on compression and decompression speed. It belongs to the LZ77 family of byte-oriented compression schemes.";
        this.infoURL = "https://wikipedia.org/wiki/LZ4_(compression_algorithm)";
        this.inputType = "byteArray";
        this.outputType = "ArrayBuffer";
        this.args = [{
            name: "Delimiter",
            type: "option",
            value: ["Raw", "Framed"]
        }];
    }

    /**
     * @param {byteArray} input
     * @param {Object[]} args
     * @returns {ArrayBuffer}
     */
    run(input, args) {
        const mode = args[0];
        const inBuf = new Uint8Array(input);
        var destSize = inBuf.byteLength*10;
        var dest = lz4.makeBuffer(destSize);

        if (mode == "Raw") {
            var size = lz4.decompressBlock(inBuf, dest, 0, inBuf.byteLength, 0);
            if ( destSize < size) {
                destSize = size;
                // Increasing buffer size if necessary
                dest = lz4.makeBuffer(destSize);
                size = lz4.decompressBlock(inBuf, dest, 0, inBuf.byteLength, 0);
            } else {
                if (size !== destSize) {
                    dest = dest.slice(0, size);
                }
            }

            return dest.buffer;
        } else {
            const decompressed = lz4.decompress(inBuf);
            return decompressed.buffer;
        }
    }
}

export default LZ4Decompress;
