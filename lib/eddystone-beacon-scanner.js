// force reporting all HCI events on Linux
process.env['NOBLE_REPORT_ALL_HCI_EVENTS'] = 1;

var events = require('events');
var util = require('util');

var crypto = require('crypto');

const CryptoJS = require('./eax');

var debug = require('debug')('eddystone-beacon-scanner');

var noble = require('noble');
var urlDecode = require('eddystone-url-encoding').decode;

var SERVICE_UUID = 'feaa';

var UID_FRAME_TYPE = 0x00;
var URL_FRAME_TYPE = 0x10;
var TLM_FRAME_TYPE = 0x20;
var EID_FRAME_TYPE = 0x30;

var EXIT_GRACE_PERIOD = 5000; // milliseconds

var EddystoneBeaconScanner = function() {
  this._discovered = {};

  this._scaler = 5;
  this._secret = Buffer.from('00112233445566778899AABBCCDDEEFF', 'hex');

  this._cipher = crypto.createCipheriv("aes-128-ecb", this._secret, '');
  this._cipher.setAutoPadding(false);
  //this._cipher = forge.cipher.createCipher('AES-ECB', this._secret);

  noble.on('discover', this.onDiscover.bind(this));
};

util.inherits(EddystoneBeaconScanner, events.EventEmitter);


EddystoneBeaconScanner.prototype.startScanning = function(allowDuplicates, gracePeriod, encryption) {
  debug('startScanning');

  var startScanningOnPowerOn = function() {
    if (noble.state === 'poweredOn') {
      noble.startScanning([SERVICE_UUID], allowDuplicates);
    } else {
      noble.once('stateChange', startScanningOnPowerOn);
    }
  };

  startScanningOnPowerOn();

  this._gracePeriod = (gracePeriod === undefined) ? EXIT_GRACE_PERIOD : gracePeriod;
  if (allowDuplicates) {
    this._lostCheckInterval = setInterval(this.checkLost.bind(this), this._gracePeriod / 2);
  }
};

EddystoneBeaconScanner.prototype.stopScanning = function() {
  clearInterval(this._lostCheckInterval);

  debug('stopScanning');
  noble.stopScanning();
};

EddystoneBeaconScanner.prototype.onDiscover = function(peripheral) {
  debug('onDiscover: %s', peripheral);

  if (this.isBeacon(peripheral)) {
    var beacon = this.parseBeacon(peripheral);
    beacon.lastSeen = Date.now();

    var oldBeacon = this._discovered[peripheral.id];

    if (!oldBeacon) {
      this.emit('found', beacon);
    } else {
      var toCopy;

      if (beacon.type === 'tlm') {
        toCopy = ['type', 'url', 'namespace', 'instance'];
      } else {
        toCopy = ['tlm'];
      }

      toCopy.forEach(function(property) {
        if (oldBeacon[property] !== undefined) {
          beacon[property] = oldBeacon[property];
        }
      });
    }

    this._discovered[peripheral.id] = beacon;

    this.emit('updated', beacon);
  }
};

EddystoneBeaconScanner.prototype.checkLost = function() {
  for (var id in this._discovered) {
    var beacon = this._discovered[id];

    if (this._discovered[id].lastSeen < (Date.now() - this._gracePeriod)) {
      this.emit('lost', beacon);

      delete this._discovered[id];
    }
  }
};

EddystoneBeaconScanner.prototype.isBeacon = function(peripheral) {
  var serviceData = peripheral.advertisement.serviceData;

  // make sure service data is present, with the expected uuid and data length
  return ( serviceData &&
           serviceData.length > 0 &&
           serviceData[0].uuid === SERVICE_UUID &&
           serviceData[0].data.length > 2
         );
};

EddystoneBeaconScanner.prototype.parseBeacon = function(peripheral) {
  var data = peripheral.advertisement.serviceData[0].data;
  var frameType = data.readUInt8(0);

  var beacon = {};
  var type = 'unknown';
  var rssi = peripheral.rssi;

  switch (frameType) {
    case UID_FRAME_TYPE:
      type = 'uid';
      beacon = this.parseUidData(data);
      break;

    case URL_FRAME_TYPE:
      type = 'url';
      beacon = this.parseUrlData(data);
      break;

    case TLM_FRAME_TYPE:
      type = 'tlm';
      beacon = this.parseTlmData(data);
      break;

    case EID_FRAME_TYPE:
      type = 'eid';
      beacon = this.parseEidData(data);
      break;

    default:
      break;
  }

  beacon.id = peripheral.id;
  beacon.type = type;
  beacon.rssi = rssi;

  var txPower = beacon.txPower;
  if (txPower !== undefined) {
    beacon.distance = this.calculateDistance(txPower, rssi);
  }

  return beacon;
};

EddystoneBeaconScanner.prototype.parseEidData = function(data) {
  return {
    txPower: data.readInt8(1),
    eid: this.decipher(data.slice(2, 9))
  };
};
EddystoneBeaconScanner.prototype.getSeconds = function () {
  return Math.floor((new Date).getTime()/1000);
};

EddystoneBeaconScanner.prototype.computeTempKey = function (seconds) {
  // TODO: Avoid recalculating.
  const buffer = Buffer.alloc(16);

  buffer.fill(0x00, 0, 11);               // Padding
  buffer.fill(0xFF, 11, 12);              // Salt
  buffer.fill(0x00, 12, 14);              // Padding
  buffer.writeInt16BE(seconds >> 16, 14); // 16 first bits of the time counter.

  return this.aes_ecb_encrypt(buffer, this._secret).slice(0,16);
};

EddystoneBeaconScanner.prototype.computeEid = function (seconds, scaler, tempKey) {
  // TODO: Check scaler value.
  const buffer = Buffer.alloc(16);
  const scaledSeconds = (seconds >> scaler) << scaler;
  buffer.fill(0x00, 0, 11);                       // Padding
  buffer.writeUInt8(scaler, 11);                  // Salt
  buffer.writeUInt32BE(scaledSeconds, 12, true);  // Top 16 bits of the time counter in 16-bit big-endian format

  return this.aes_ecb_encrypt(buffer, tempKey).slice(0,8);
};

EddystoneBeaconScanner.prototype.decryptTlm = function (frame, seconds, scaler) {
  const salt = frame.readUInt16BE(14);                // Read salt

  // Recreate the nonce.
  const nonce = Buffer.alloc(6);
  nonce.writeUInt32BE((seconds >> scaler) << scaler); // Time base
  nonce.writeUInt16BE(salt, 4);                       // Salt

  // Remove the salt.
  const data = Buffer.alloc(14);
  frame.copy(data, 0, 2, 14);                         // TLM data
  frame.copy(data, 12, 16, 18);                       // MIC (message integrity check)

  const deciphered = this.aes_eax_decrypt(data, this._secret, nonce);
  if (deciphered) {
    return deciphered;
  } else {
    return null;
  }
};

EddystoneBeaconScanner.prototype.aes_ecb_encrypt = function(dataBuffer, keyBuffer) {
  const cipher = crypto.createCipheriv("aes-128-ecb", keyBuffer, '');
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
};

EddystoneBeaconScanner.prototype.aes_eax_decrypt = function(dataBuffer, keyBuffer, nonceBuffer) {
  // Convert the buffers.
  const key = CryptoJS.enc.Hex.parse(keyBuffer.toString('hex'));
  let cipher = CryptoJS.EAX.create(key, {tagLength: 2});
  const data = CryptoJS.enc.Hex.parse(dataBuffer.toString('hex'));
  const nonce = CryptoJS.enc.Hex.parse(nonceBuffer.toString('hex'));

  const deciphered = cipher.decrypt(data, nonce);

  if (!deciphered) {
    return null;
  } else {
    return Buffer.from(deciphered.toString(), 'hex');
  }
};

EddystoneBeaconScanner.prototype.decipher = function (data) {
  var seconds = this.getSeconds();
  var tempKey = this.computeTempKey(seconds);
  var eid = this.computeEid(seconds, this._scaler, tempKey);
  return eid === data.toString('hex');
};

EddystoneBeaconScanner.prototype.parseUidData = function(data) {
  return {
    txPower: data.readInt8(1),
    namespace: data.slice(2, 12).toString('hex'),
    instance: data.slice(12, 18).toString('hex'),
  };
};

EddystoneBeaconScanner.prototype.parseUrlData = function(data) {
  return {
    txPower: data.readInt8(1),
    url: urlDecode(data.slice(2))
  };
};

EddystoneBeaconScanner.prototype.parseTlmData = function(data) {
  return {
    tlm: {
      version: data.readUInt8(1),
      vbatt: data.readUInt16BE(2),
      temp: data.readInt16BE(4) / 256,
      advCnt: data.readUInt32BE(6),
      secCnt: data.readUInt32BE(10)
    }
  };
};

EddystoneBeaconScanner.prototype.calculateDistance = function(txPower, rssi) {
  return Math.pow(10, ((txPower - rssi) - 41) / 20.0);
};

module.exports = EddystoneBeaconScanner;
