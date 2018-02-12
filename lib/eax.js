/*
 * The MIT License (MIT)
 * 
 * Copyright (c) 2015 artjomb
 */
var CryptoJS = require("crypto-js");
(function(C){
    // put on ext property in CryptoJS
    var ext;
    if (!C.hasOwnProperty("ext")) {
        ext = C.ext = {};
    } else {
        ext = C.ext;
    }
    
    /**
     * Shifts the array by n bits to the left. Zero bits are added as the 
     * least significant bits. This operation modifies the current array.
     * 
     * @param {WordArray} wordArray WordArray to work on
     * @param {int} n Bits to shift by
     * 
     * @returns the WordArray that was passed in
     */
    ext.bitshift = function(wordArray, n){
        var carry = 0,
            words = wordArray.words,
            wres,
            skipped = 0,
            carryMask;
        if (n > 0) {
            while(n > 31) {
                // delete first element:
                words.splice(0, 1);
                
                // add `0` word to the back
                words.push(0);
                
                n -= 32;
                skipped++;
            }
            if (n == 0) {
                // 1. nothing to shift if the shift amount is on a word boundary
                // 2. This has to be done, because the following algorithm computes 
                // wrong values only for n==0
                return carry;
            }
            for(var i = words.length - skipped - 1; i >= 0; i--) {
                wres = words[i];
                words[i] <<= n;
                words[i] |= carry;
                carry = wres >>> (32 - n);
            }
        } else if (n < 0) {
            while(n < -31) {
                // insert `0` word to the front:
                words.splice(0, 0, 0);
                
                // remove last element:
                words.length--;
                
                n += 32;
                skipped++;
            }
            if (n == 0) {
                // nothing to shift if the shift amount is on a word boundary
                return carry;
            }
            n = -n;
            carryMask = (1 << n) - 1;
            for(var i = skipped; i < words.length; i++) {
                wres = words[i] & carryMask;
                words[i] >>>= n;
                words[i] |= carry;
                carry = wres << (32 - n);
            }
        }
        return carry;
    };
    
    /**
     * Negates all bits in the WordArray. This manipulates the given array.
     * 
     * @param {WordArray} wordArray WordArray to work on
     * 
     * @returns the WordArray that was passed in
     */
    ext.neg = function(wordArray){
        var words = wordArray.words;
        for(var i = 0; i < words.length; i++) {
            words[i] = ~words[i];
        }
        return wordArray;
    };
    
    /**
     * Applies XOR on both given word arrays and returns a third resulting 
     * WordArray. The initial word arrays must have the same length 
     * (significant bytes).
     * 
     * @param {WordArray} wordArray1 WordArray
     * @param {WordArray} wordArray2 WordArray
     * 
     * @returns first passed WordArray (modified)
     */
    ext.xor = function(wordArray1, wordArray2){
        for(var i = 0; i < wordArray1.words.length; i++) {
            wordArray1.words[i] ^= wordArray2.words[i];
        }
        return wordArray1;
    };
    
    /**
     * Logical AND between the two passed arrays. Both arrays must have the 
     * same length.
     * 
     * @param {WordArray} arr1 Array 1
     * @param {WordArray} arr2 Array 2
     * 
     * @returns new WordArray
     */
    ext.bitand = function(arr1, arr2){
        var newArr = arr1.clone(),
            tw = newArr.words,
            ow = arr2.words;
        for(var i = 0; i < tw.length; i++) {
            tw[i] &= ow[i];
        }
        return newArr;
    };
})(CryptoJS);

/* 
 * The MIT License (MIT)
 * 
 * Copyright (c) 2015 artjomb
 */
(function(C){
    // put on ext property in CryptoJS
    var ext;
    if (!C.hasOwnProperty("ext")) {
        ext = C.ext = {};
    } else {
        ext = C.ext;
    }
    
    // Shortcuts
    var Base = C.lib.Base;
    var WordArray = C.lib.WordArray;
    var AES = C.algo.AES;
    
    // Constants
    ext.const_Zero = WordArray.create([0x00000000, 0x00000000, 0x00000000, 0x00000000]);
    ext.const_One = WordArray.create([0x00000000, 0x00000000, 0x00000000, 0x00000001]);
    ext.const_Rb = WordArray.create([0x00000000, 0x00000000, 0x00000000, 0x00000087]); // 00..0010000111
    ext.const_Rb_Shifted = WordArray.create([0x80000000, 0x00000000, 0x00000000, 0x00000043]); // 100..001000011
    ext.const_nonMSB = WordArray.create([0xFFFFFFFF, 0xFFFFFFFF, 0x7FFFFFFF, 0x7FFFFFFF]); // 1^64 || 0^1 || 1^31 || 0^1 || 1^31
    
    /**
     * Looks into the object to see if it is a WordArray.
     * 
     * @param obj Some object
     * 
     * @returns {boolean}
     
     */
    ext.isWordArray = function(obj) {
        return obj && typeof obj.clamp === "function" && typeof obj.concat === "function" && typeof obj.words === "array";
    }
    
    /**
     * This padding is a 1 bit followed by as many 0 bits as needed to fill 
     * up the block. This implementation doesn't work on bits directly, 
     * but on bytes. Therefore the granularity is much bigger.
     */
    C.pad.OneZeroPadding = {
        pad: function (data, blocksize) {
            // Shortcut
            var blockSizeBytes = blocksize * 4;

            // Count padding bytes
            var nPaddingBytes = blockSizeBytes - data.sigBytes % blockSizeBytes;
            
            // Create padding
            var paddingWords = [];
            for (var i = 0; i < nPaddingBytes; i += 4) {
                var paddingWord = 0x00000000;
                if (i === 0) {
                    paddingWord = 0x80000000;
                }
                paddingWords.push(paddingWord);
            }
            var padding = WordArray.create(paddingWords, nPaddingBytes);

            // Add padding
            data.concat(padding);
        },
        unpad: function () {
            // TODO: implement
        }
    };
    
    /**
     * No padding is applied. This is necessary for streaming cipher modes 
     * like CTR.
     */
    C.pad.NoPadding = {
        pad: function () {},
        unpad: function () {}
    };
    
    /**
     * Returns the n leftmost bytes of the WordArray.
     * 
     * @param {WordArray} wordArray WordArray to work on
     * @param {int} n Bytes to retrieve
     * 
     * @returns new WordArray
     */
    ext.leftmostBytes = function(wordArray, n){
        var lmArray = wordArray.clone();
        lmArray.sigBytes = n;
        lmArray.clamp();
        return lmArray;
    };
    
    /**
     * Returns the n rightmost bytes of the WordArray.
     * 
     * @param {WordArray} wordArray WordArray to work on
     * @param {int} n Bytes to retrieve (must be positive)
     * 
     * @returns new WordArray
     */
    ext.rightmostBytes = function(wordArray, n){
        wordArray.clamp();
        var wordSize = 32;
        var rmArray = wordArray.clone();
        var bitsToShift = (rmArray.sigBytes - n) * 8;
        if (bitsToShift >= wordSize) {
            var popCount = Math.floor(bitsToShift/wordSize);
            bitsToShift -= popCount * wordSize;
            rmArray.words.splice(0, popCount);
            rmArray.sigBytes -= popCount * wordSize / 8;
        }
        if (bitsToShift > 0) {
            ext.bitshift(rmArray, bitsToShift);
            rmArray.sigBytes -= bitsToShift / 8;
        }
        return rmArray;
    };
    
    /**
     * Returns the n rightmost words of the WordArray. It assumes 
     * that the current WordArray has at least n words.
     * 
     * @param {WordArray} wordArray WordArray to work on
     * @param {int} n Words to retrieve (must be positive)
     * 
     * @returns popped words as new WordArray
     */
    ext.popWords = function(wordArray, n){
        var left = ext.leftmostBytes(wordArray, n * 4);
        wordArray.words = wordArray.words.slice(n);
        wordArray.sigBytes -= n * 4;
        return left;
    };
    
    /**
     * Shifts the array to the left and returns the shifted dropped elements 
     * as WordArray. The initial WordArray must contain at least n bytes and 
     * they have to be significant.
     * 
     * @param {WordArray} wordArray WordArray to work on (is modified)
     * @param {int} n Bytes to shift (must be positive, default 16)
     * 
     * @returns new WordArray
     */
    ext.shiftBytes = function(wordArray, n){
        n = n || 16;
        var r = n % 4;
        n -= r;
        
        var shiftedArray = WordArray.create();
        for(var i = 0; i < n; i += 4) {
            shiftedArray.words.push(wordArray.words.shift());
            wordArray.sigBytes -= 4;
            shiftedArray.sigBytes += 4;
        }
        if (r > 0) {
            shiftedArray.words.push(wordArray.words[0]);
            shiftedArray.sigBytes += r;
            
            ext.bitshift(wordArray, r * 8);
            wordArray.sigBytes -= r;
        }
        return shiftedArray;
    };
    
    /**
     * XORs arr2 to the end of arr1 array. This doesn't modify the current 
     * array aside from clamping.
     * 
     * @param {WordArray} arr1 Bigger array
     * @param {WordArray} arr2 Smaller array to be XORed to the end
     * 
     * @returns new WordArray
     */
    ext.xorendBytes = function(arr1, arr2){
        // TODO: more efficient
        return ext.leftmostBytes(arr1, arr1.sigBytes-arr2.sigBytes)
                .concat(ext.xor(ext.rightmostBytes(arr1, arr2.sigBytes), arr2));
    };
    
    /**
     * Doubling operation on a 128-bit value. This operation modifies the 
     * passed array.
     * 
     * @param {WordArray} wordArray WordArray to work on
     * 
     * @returns passed WordArray
     */
    ext.dbl = function(wordArray){
        var carry = ext.msb(wordArray);
        ext.bitshift(wordArray, 1);
        ext.xor(wordArray, carry === 1 ? ext.const_Rb : ext.const_Zero);
        return wordArray;
    };
    
    /**
     * Inverse operation on a 128-bit value. This operation modifies the 
     * passed array.
     * 
     * @param {WordArray} wordArray WordArray to work on
     * 
     * @returns passed WordArray
     */
    ext.inv = function(wordArray){
        var carry = wordArray.words[4] & 1;
        ext.bitshift(wordArray, -1);
        ext.xor(wordArray, carry === 1 ? ext.const_Rb_Shifted : ext.const_Zero);
        return wordArray;
    };
    
    /**
     * Check whether the word arrays are equal.
     * 
     * @param {WordArray} arr1 Array 1
     * @param {WordArray} arr2 Array 2
     *
     * @returns boolean
     */
    ext.equals = function(arr1, arr2){
        if (!arr2 || !arr2.words || arr1.sigBytes !== arr2.sigBytes) {
            return false;
        }
        arr1.clamp();
        arr2.clamp();
        var equal = 0;
        for(var i = 0; i < arr1.words.length; i++) {
            equal |= arr1.words[i] ^ arr2.words[i];
        }
        return equal === 0;
    };
    
    /**
     * Retrieves the most significant bit of the WordArray as an Integer.
     *
     * @param {WordArray} arr
     *
     * @returns Integer
     */
    ext.msb = function(arr) {
        return arr.words[0] >>> 31;
    }
})(CryptoJS);

/* 
 * The MIT License (MIT)
 * 
 * Copyright (c) 2015 artjomb
 */
(function(C){
    // Shortcuts
    var Base = C.lib.Base;
    var WordArray = C.lib.WordArray;
    var AES = C.algo.AES;
    var ext = C.ext;
    var OneZeroPadding = C.pad.OneZeroPadding;
    
    function aesBlock(key, data){
        var aes128 = AES.createEncryptor(key, { iv: WordArray.create(), padding: C.pad.NoPadding });
        var arr = aes128.finalize(data);
        return arr;
    }
    
    var CMAC = C.algo.CMAC = Base.extend({
        /**
         * Initializes a newly created CMAC
         * 
         * @param {WordArray} key The secret key
         *
         * @example
         * 
         *     var cmacer = CryptoJS.algo.CMAC.create(key);
         */
        init: function(key){
            // generate sub keys...
            
            // Step 1
            var L = aesBlock(key, ext.const_Zero);
            
            // Step 2
            var K1 = L.clone();
            ext.dbl(K1);
            
            // Step 3
            if (!this._isTwo) {
                var K2 = K1.clone();
                ext.dbl(K2);
            } else {
                var K2 = L.clone();
                ext.inv(K2);
            }
            
            this._K1 = K1;
            this._K2 = K2;
            this._K = key;
            
            this._const_Bsize = 16;
            
            this.reset();
        },
        
        reset: function () {
            this._x = ext.const_Zero.clone();
            this._counter = 0;
            this._buffer = WordArray.create();
        },

        update: function (messageUpdate) {
            if (!messageUpdate) {
                return this;
            }
            
            // Shortcuts
            var buffer = this._buffer;
            var bsize = this._const_Bsize;
            
            if (typeof messageUpdate === "string") {
                messageUpdate = C.enc.Utf8.parse(messageUpdate);
            }
            
            buffer.concat(messageUpdate);
            
            while(buffer.sigBytes > bsize){
                var M_i = ext.shiftBytes(buffer, bsize);
                ext.xor(this._x, M_i);
                this._x.clamp();
                this._x = aesBlock(this._K, this._x);
                this._counter++;
            }

            // Chainable
            return this;
        },
        
        finalize: function (messageUpdate) {
            this.update(messageUpdate);
            
            // Shortcuts
            var buffer = this._buffer;
            var bsize = this._const_Bsize;
            
            var M_last = buffer.clone();
            if (buffer.sigBytes === bsize) {
                ext.xor(M_last, this._K1);
            } else {
                OneZeroPadding.pad(M_last, bsize/4);
                ext.xor(M_last, this._K2);
            }
            
            ext.xor(M_last, this._x);

            this.reset(); // Can be used immediately afterwards
            
            return aesBlock(this._K, M_last);
        },
        
        _isTwo: false
    });
    
    /**
     * Directly invokes the CMAC and returns the calculated MAC.
     * 
     * @param {WordArray} key The key to be used for CMAC
     * @param {WordArray|string} message The data to be MAC'ed (either WordArray or UTF-8 encoded string)
     *
     * @returns {WordArray} MAC
     */
    C.CMAC = function(key, message){
        return CMAC.create(key).finalize(message);
    };
    
    C.algo.OMAC1 = CMAC;
    C.algo.OMAC2 = CMAC.extend({
        _isTwo: true
    });
})(CryptoJS);

/* 
 * The MIT License (MIT)
 * 
 * Copyright (c) 2015 artjomb
 */
(function(C){
    // Shortcuts
    var Base = C.lib.Base;
    var WordArray = C.lib.WordArray;
    var AES = C.algo.AES;
    var ext = C.ext;
    var CMAC = C.algo.CMAC;
    var zero = WordArray.create([0x0, 0x0, 0x0, 0x0]);
    var one = WordArray.create([0x0, 0x0, 0x0, 0x1]);
    var two = WordArray.create([0x0, 0x0, 0x0, 0x2]);
    var blockLength = 16;
    
    var EAX = C.EAX = Base.extend({
        /**
         * Initializes the key of the cipher.
         * 
         * @param {WordArray} key Key to be used for CMAC and CTR
         * @param {object} options Additonal options to tweak the encryption:
         *        splitKey - If true then the first half of the passed key will be 
         *                   the CMAC key and the second half the CTR key
         *        tagLength - Length of the tag in bytes (for created tag and expected tag)
         */
        init: function(key, options){
            var macKey;
            if (options && options.splitKey) {
                var len = Math.floor(key.sigBytes / 2);
                macKey = ext.shiftBytes(key, len);
            } else {
                macKey = key.clone();
            }
            this._ctrKey = key;
            this._mac = CMAC.create(macKey);
            
            this._tagLen = (options && options.tagLength) || blockLength;
            this.reset();
        },
        reset: function(){
            this._mac.update(one);
            if (this._ctr) {
                this._ctr.reset();
            }
        },
        updateAAD: function(header){
            this._mac.update(header);
            return this;
        },
        initCrypt: function(isEncrypt, nonce){
            var self = this;
            self._tag = self._mac.finalize();
            self._isEnc = isEncrypt;
            
            self._mac.update(zero);
            nonce = self._mac.finalize(nonce);
            
            ext.xor(self._tag, nonce);
            
            self._ctr = AES.createEncryptor(self._ctrKey, {
                iv: nonce, 
                mode: C.mode.CTR, 
                padding: C.pad.NoPadding
            });
            self._buf = WordArray.create();
            
            self._mac.update(two);
            
            return self;
        },
        update: function(msg) {
            if (typeof msg === "string") {
                msg = C.enc.Utf8.parse(msg);
            }
            var self = this;
            var buffer = self._buf;
            var isEncrypt = self._isEnc;
            buffer.concat(msg);
            
            var useBytes = isEncrypt ? buffer.sigBytes : Math.max(buffer.sigBytes - self._tagLen, 0);
            
            var data = useBytes > 0 ? ext.shiftBytes(buffer, useBytes) : WordArray.create(); // guaranteed to be pure plaintext or ciphertext (without a tag during decryption)
            var xoredData = self._ctr.process(data);
            
            self._mac.update(isEncrypt ? xoredData : data);
            
            return xoredData;
        },
        finalize: function(msg){
            var self = this;
            var xoredData = msg ? self.update(msg) : WordArray.create();
            var mac = self._mac;
            var ctFin = self._ctr.finalize();
            
            if (self._isEnc) {
                var ctTag = mac.finalize(ctFin);
                
                ext.xor(self._tag, ctTag);
                self.reset();
                return xoredData.concat(ctFin).concat(ext.leftmostBytes(self._tag, self._tagLen));
            } else {
                // buffer must contain only the tag at this point
                var ctTag = mac.finalize();
                
                ext.xor(self._tag, ctTag);
                self.reset();
                if (ext.equals(ext.leftmostBytes(self._tag, self._tagLen), self._buf)) {
                    return xoredData.concat(ctFin);
                } else {
                    return false; // tag doesn't match
                }
            }
        },
        encrypt: function(plaintext, nonce, adArray){
            var self = this;
            if (adArray) {
                Array.prototype.forEach.call(adArray, function(ad){
                    self.updateAAD(ad);
                });
            }
            self.initCrypt(true, nonce);
            
            return self.finalize(plaintext);
        },
        decrypt: function(ciphertext, nonce, adArray){
            var self = this;
            if (adArray) {
                Array.prototype.forEach.call(adArray, function(ad){
                    self.updateAAD(ad);
                });
            }
            self.initCrypt(false, nonce);
            
            return self.finalize(ciphertext);
        }
    });
})(CryptoJS);

module.exports = CryptoJS;
