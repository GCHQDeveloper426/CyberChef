// The MIT License (MIT)
//
// Copyright (c) 2016 Zhipeng Jia
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

'use strict'

var BLOCK_LOG = 16
var BLOCK_SIZE = 1 << BLOCK_LOG

var MAX_HASH_TABLE_BITS = 14
var globalHashTables = new Array(MAX_HASH_TABLE_BITS + 1)

// Compression Functions 

function hashFunc (key, hashFuncShift) {
  return (key * 0x1e35a7bd) >>> hashFuncShift
}

function load32 (array, pos) {
  return array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24)
}

function equals32 (array, pos1, pos2) {
  return array[pos1] === array[pos2] &&
         array[pos1 + 1] === array[pos2 + 1] &&
         array[pos1 + 2] === array[pos2 + 2] &&
         array[pos1 + 3] === array[pos2 + 3]
}

function copyBytes (fromArray, fromPos, toArray, toPos, length) {
  var i
  for (i = 0; i < length; i++) {
    toArray[toPos + i] = fromArray[fromPos + i]
  }
}

function emitLiteral (input, ip, len, output, op) {
  if (len <= 60) {
    output[op] = (len - 1) << 2
    op += 1
  } else if (len < 256) {
    output[op] = 60 << 2
    output[op + 1] = len - 1
    op += 2
  } else {
    output[op] = 61 << 2
    output[op + 1] = (len - 1) & 0xff
    output[op + 2] = (len - 1) >>> 8
    op += 3
  }
  copyBytes(input, ip, output, op, len)
  return op + len
}

function emitCopyLessThan64 (output, op, offset, len) {
  if (len < 12 && offset < 2048) {
    output[op] = 1 + ((len - 4) << 2) + ((offset >>> 8) << 5)
    output[op + 1] = offset & 0xff
    return op + 2
  } else {
    output[op] = 2 + ((len - 1) << 2)
    output[op + 1] = offset & 0xff
    output[op + 2] = offset >>> 8
    return op + 3
  }
}

function emitCopy (output, op, offset, len) {
  while (len >= 68) {
    op = emitCopyLessThan64(output, op, offset, 64)
    len -= 64
  }
  if (len > 64) {
    op = emitCopyLessThan64(output, op, offset, 60)
    len -= 60
  }
  return emitCopyLessThan64(output, op, offset, len)
}

function compressFragment (input, ip, inputSize, output, op) {
  var hashTableBits = 1
  while ((1 << hashTableBits) <= inputSize &&
         hashTableBits <= MAX_HASH_TABLE_BITS) {
    hashTableBits += 1
  }
  hashTableBits -= 1
  var hashFuncShift = 32 - hashTableBits

  if (typeof globalHashTables[hashTableBits] === 'undefined') {
    globalHashTables[hashTableBits] = new Uint16Array(1 << hashTableBits)
  }
  var hashTable = globalHashTables[hashTableBits]
  var i
  for (i = 0; i < hashTable.length; i++) {
    hashTable[i] = 0
  }

  var ipEnd = ip + inputSize
  var ipLimit
  var baseIp = ip
  var nextEmit = ip

  var hash, nextHash
  var nextIp, candidate, skip
  var bytesBetweenHashLookups
  var base, matched, offset
  var prevHash, curHash
  var flag = true

  var INPUT_MARGIN = 15
  if (inputSize >= INPUT_MARGIN) {
    ipLimit = ipEnd - INPUT_MARGIN

    ip += 1
    nextHash = hashFunc(load32(input, ip), hashFuncShift)

    while (flag) {
      skip = 32
      nextIp = ip
      do {
        ip = nextIp
        hash = nextHash
        bytesBetweenHashLookups = skip >>> 5
        skip += 1
        nextIp = ip + bytesBetweenHashLookups
        if (ip > ipLimit) {
          flag = false
          break
        }
        nextHash = hashFunc(load32(input, nextIp), hashFuncShift)
        candidate = baseIp + hashTable[hash]
        hashTable[hash] = ip - baseIp
      } while (!equals32(input, ip, candidate))

      if (!flag) {
        break
      }

      op = emitLiteral(input, nextEmit, ip - nextEmit, output, op)

      do {
        base = ip
        matched = 4
        while (ip + matched < ipEnd && input[ip + matched] === input[candidate + matched]) {
          matched += 1
        }
        ip += matched
        offset = base - candidate
        op = emitCopy(output, op, offset, matched)

        nextEmit = ip
        if (ip >= ipLimit) {
          flag = false
          break
        }
        prevHash = hashFunc(load32(input, ip - 1), hashFuncShift)
        hashTable[prevHash] = ip - 1 - baseIp
        curHash = hashFunc(load32(input, ip), hashFuncShift)
        candidate = baseIp + hashTable[curHash]
        hashTable[curHash] = ip - baseIp
      } while (equals32(input, ip, candidate))

      if (!flag) {
        break
      }

      ip += 1
      nextHash = hashFunc(load32(input, ip), hashFuncShift)
    }
  }

  if (nextEmit < ipEnd) {
    op = emitLiteral(input, nextEmit, ipEnd - nextEmit, output, op)
  }

  return op
}

function putVarint (value, output, op) {
  do {
    output[op] = value & 0x7f
    value = value >>> 7
    if (value > 0) {
      output[op] += 0x80
    }
    op += 1
  } while (value > 0)
  return op
}

function SnappyCompressor (uncompressed) {
  this.array = uncompressed
}

SnappyCompressor.prototype.maxCompressedLength = function () {
  var sourceLen = this.array.length
  return 32 + sourceLen + Math.floor(sourceLen / 6)
}

SnappyCompressor.prototype.compressToBuffer = function (outBuffer) {
  var array = this.array
  var length = array.length
  var pos = 0
  var outPos = 0

  var fragmentSize

  outPos = putVarint(length, outBuffer, outPos)
  while (pos < length) {
    fragmentSize = Math.min(length - pos, BLOCK_SIZE)
    outPos = compressFragment(array, pos, fragmentSize, outBuffer, outPos)
    pos += fragmentSize
  }

  return outPos
}

// Decompress Functions

var WORD_MASK = [0, 0xff, 0xffff, 0xffffff, 0xffffffff]

/*function copyBytes (fromArray, fromPos, toArray, toPos, length) {
  var i
  for (i = 0; i < length; i++) {
    toArray[toPos + i] = fromArray[fromPos + i]
  }
}*/

function selfCopyBytes (array, pos, offset, length) {
  var i
  for (i = 0; i < length; i++) {
    array[pos + i] = array[pos - offset + i]
  }
}

function SnappyDecompressor (compressed) {
  this.array = compressed
  this.pos = 0
}

SnappyDecompressor.prototype.readUncompressedLength = function () {
  var result = 0
  var shift = 0
  var c, val
  while (shift < 32 && this.pos < this.array.length) {
    c = this.array[this.pos]
    this.pos += 1
    val = c & 0x7f
    if (((val << shift) >>> shift) !== val) {
      return -1
    }
    result |= val << shift
    if (c < 128) {
      return result
    }
    shift += 7
  }
  return -1
}

SnappyDecompressor.prototype.uncompressToBuffer = function (outBuffer) {
  var array = this.array
  var arrayLength = array.length
  var pos = this.pos
  var outPos = 0

  var c, len, smallLen
  var offset

  while (pos < array.length) {
    c = array[pos]
    pos += 1
    if ((c & 0x3) === 0) {
      // Literal
      len = (c >>> 2) + 1
      if (len > 60) {
        if (pos + 3 >= arrayLength) {
          return false
        }
        smallLen = len - 60
        len = array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24)
        len = (len & WORD_MASK[smallLen]) + 1
        pos += smallLen
      }
      if (pos + len > arrayLength) {
        return false
      }
      copyBytes(array, pos, outBuffer, outPos, len)
      pos += len
      outPos += len
    } else {
      switch (c & 0x3) {
        case 1:
          len = ((c >>> 2) & 0x7) + 4
          offset = array[pos] + ((c >>> 5) << 8)
          pos += 1
          break
        case 2:
          if (pos + 1 >= arrayLength) {
            return false
          }
          len = (c >>> 2) + 1
          offset = array[pos] + (array[pos + 1] << 8)
          pos += 2
          break
        case 3:
          if (pos + 3 >= arrayLength) {
            return false
          }
          len = (c >>> 2) + 1
          offset = array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24)
          pos += 4
          break
        default:
          break
      }
      if (offset === 0 || offset > outPos) {
        return false
      }
      selfCopyBytes(outBuffer, outPos, offset, len)
      outPos += len
    }
  }
  return true
}

// Index Wrapper


function isNode () {
  if (typeof process === 'object') {
    if (typeof process.versions === 'object') {
      if (typeof process.versions.node !== 'undefined') {
        return true
      }
    }
  }
  return false
}

function isUint8Array (object) {
  return object instanceof Uint8Array && (!isNode() || !Buffer.isBuffer(object))
}

function isArrayBuffer (object) {
  return object instanceof ArrayBuffer
}

function isBuffer (object) {
  if (!isNode()) {
    return false
  }
  return Buffer.isBuffer(object)
}


//var SnappyDecompressor = require('./snappy_decompressor').SnappyDecompressor
//var SnappyCompressor = require('./snappy_compressor').SnappyCompressor


const Snappy = {
    TYPE_ERROR_MSG: 'Argument compressed must be type of ArrayBuffer, Buffer, or Uint8Array',
    uncompress: function(compressed) {
      if (!isUint8Array(compressed) && !isArrayBuffer(compressed) && !isBuffer(compressed)) {
        throw new TypeError(TYPE_ERROR_MSG)
      }
      var uint8Mode = false
      var arrayBufferMode = false
      if (isUint8Array(compressed)) {
        uint8Mode = true
      } else if (isArrayBuffer(compressed)) {
        arrayBufferMode = true
        compressed = new Uint8Array(compressed)
      }
      var decompressor = new SnappyDecompressor(compressed)
      var length = decompressor.readUncompressedLength()
      if (length === -1) {
        throw new Error('Invalid Snappy bitstream')
      }
      if (length > maxLength) {
        throw new Error(`The uncompressed length of ${length} is too big, expect at most ${maxLength}`)
      }
      var uncompressed, uncompressedView
      if (uint8Mode) {
        uncompressed = new Uint8Array(length)
        if (!decompressor.uncompressToBuffer(uncompressed)) {
          throw new Error('Invalid Snappy bitstream')
        }
      } else if (arrayBufferMode) {
        uncompressed = new ArrayBuffer(length)
        uncompressedView = new Uint8Array(uncompressed)
        if (!decompressor.uncompressToBuffer(uncompressedView)) {
          throw new Error('Invalid Snappy bitstream')
        }
      } else {
        uncompressed = Buffer.alloc(length)
        if (!decompressor.uncompressToBuffer(uncompressed)) {
          throw new Error('Invalid Snappy bitstream')
        }
  }
  return uncompressed              
},
    compress: function(uncompressed) {
      if (!isUint8Array(uncompressed) && !isArrayBuffer(uncompressed) && !isBuffer(uncompressed)) {
        throw new TypeError(TYPE_ERROR_MSG)
      }
      var uint8Mode = false
      var arrayBufferMode = false
      if (isUint8Array(uncompressed)) {
        uint8Mode = true
      } else if (isArrayBuffer(uncompressed)) {
        arrayBufferMode = true
        uncompressed = new Uint8Array(uncompressed)
      }
      var compressor = new SnappyCompressor(uncompressed)
      var maxLength = compressor.maxCompressedLength()
      var compressed, compressedView
      var length
      if (uint8Mode) {
        compressed = new Uint8Array(maxLength)
        length = compressor.compressToBuffer(compressed)
      } else if (arrayBufferMode) {
        compressed = new ArrayBuffer(maxLength)
        compressedView = new Uint8Array(compressed)
        length = compressor.compressToBuffer(compressedView)
      } else {
        compressed = Buffer.alloc(maxLength)
        length = compressor.compressToBuffer(compressed)
      }
      if (!compressed.slice) { // ie11
        var compressedArray = new Uint8Array(Array.prototype.slice.call(compressed, 0, length))
        if (uint8Mode) {
          return compressedArray
        } else if (arrayBufferMode) {
          return compressedArray.buffer
        } else {
          throw new Error('Not implemented')
        }
      }
    
      return compressed.slice(0, length)
    }
}



/*
var TYPE_ERROR_MSG = 'Argument compressed must be type of ArrayBuffer, Buffer, or Uint8Array'

function uncompress (compressed, maxLength) {
  if (!isUint8Array(compressed) && !isArrayBuffer(compressed) && !isBuffer(compressed)) {
    throw new TypeError(TYPE_ERROR_MSG)
  }
  var uint8Mode = false
  var arrayBufferMode = false
  if (isUint8Array(compressed)) {
    uint8Mode = true
  } else if (isArrayBuffer(compressed)) {
    arrayBufferMode = true
    compressed = new Uint8Array(compressed)
  }
  var decompressor = new SnappyDecompressor(compressed)
  var length = decompressor.readUncompressedLength()
  if (length === -1) {
    throw new Error('Invalid Snappy bitstream')
  }
  if (length > maxLength) {
    throw new Error(`The uncompressed length of ${length} is too big, expect at most ${maxLength}`)
  }
  var uncompressed, uncompressedView
  if (uint8Mode) {
    uncompressed = new Uint8Array(length)
    if (!decompressor.uncompressToBuffer(uncompressed)) {
      throw new Error('Invalid Snappy bitstream')
    }
  } else if (arrayBufferMode) {
    uncompressed = new ArrayBuffer(length)
    uncompressedView = new Uint8Array(uncompressed)
    if (!decompressor.uncompressToBuffer(uncompressedView)) {
      throw new Error('Invalid Snappy bitstream')
    }
  } else {
    uncompressed = Buffer.alloc(length)
    if (!decompressor.uncompressToBuffer(uncompressed)) {
      throw new Error('Invalid Snappy bitstream')
    }
  }
  return uncompressed
}

function compress (uncompressed) {
  if (!isUint8Array(uncompressed) && !isArrayBuffer(uncompressed) && !isBuffer(uncompressed)) {
    throw new TypeError(TYPE_ERROR_MSG)
  }
  var uint8Mode = false
  var arrayBufferMode = false
  if (isUint8Array(uncompressed)) {
    uint8Mode = true
  } else if (isArrayBuffer(uncompressed)) {
    arrayBufferMode = true
    uncompressed = new Uint8Array(uncompressed)
  }
  var compressor = new SnappyCompressor(uncompressed)
  var maxLength = compressor.maxCompressedLength()
  var compressed, compressedView
  var length
  if (uint8Mode) {
    compressed = new Uint8Array(maxLength)
    length = compressor.compressToBuffer(compressed)
  } else if (arrayBufferMode) {
    compressed = new ArrayBuffer(maxLength)
    compressedView = new Uint8Array(compressed)
    length = compressor.compressToBuffer(compressedView)
  } else {
    compressed = Buffer.alloc(maxLength)
    length = compressor.compressToBuffer(compressed)
  }
  if (!compressed.slice) { // ie11
    var compressedArray = new Uint8Array(Array.prototype.slice.call(compressed, 0, length))
    if (uint8Mode) {
      return compressedArray
    } else if (arrayBufferMode) {
      return compressedArray.buffer
    } else {
      throw new Error('Not implemented')
    }
  }

  return compressed.slice(0, length)
}*/

export default Snappy;
