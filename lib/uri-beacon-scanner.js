var events = require('events');
var util = require('util');

var debug = require('debug')('uri-beacon-scanner');

var noble = require('noble');

var SERVICE_UUID = 'fed8';

var PREFIXES = require('./prefixes.json');
var SUFFIXES = require('./suffixes.json');

var UriBeaconScanner = function() {
  noble.on('discover', this.onDiscover.bind(this));
};

util.inherits(UriBeaconScanner, events.EventEmitter);

UriBeaconScanner.prototype.startScanning = function(allowDuplicates) {
  debug('startScanning');

  var startScanningOnPowerOn = function() {
    if (noble.state === 'poweredOn') {
      noble.startScanning([SERVICE_UUID], allowDuplicates);
    } else {
      noble.once('stateChange', startScanningOnPowerOn);
    }
  };

  startScanningOnPowerOn();
};

UriBeaconScanner.prototype.stopScanning = function() {
  debug('stopScanning');
  noble.stopScanning();
};

UriBeaconScanner.prototype.onDiscover = function(peripheral) {
  debug('onDiscover: %s', peripheral);

  if (this.isUriBeacon(peripheral)) {
    var uriBeacon = this.parseUriBeacon(peripheral);

    debug('onDiscover: uriBeacon = %s', JSON.stringify(uriBeacon));
    this.emit('discover', uriBeacon);
  }
};

UriBeaconScanner.prototype.isUriBeacon = function(peripheral) {
  var serviceData = peripheral.advertisement.serviceData;

  // make sure service data is present, with the expected uuid and data length
  return ( serviceData &&
           serviceData.length > 0 &&
           serviceData[0].uuid === SERVICE_UUID &&
           serviceData[0].data.length > 2
         );
};

UriBeaconScanner.prototype.parseUriBeacon = function(peripheral) {
  var rssi = peripheral.rssi;
  var data = peripheral.advertisement.serviceData[0].data;

  var flags = data.readUInt8(0); // flag is the 1st byte
  var txPower = data.readInt8(1); // TX Power is 2nd byte
  var firstByte = data[2];
  var uriData = data.slice(3); // remainder in the URI
  var uriPrefix = '';

  // decode prefix, if needed
  if (firstByte < PREFIXES.length) {
    uriPrefix = PREFIXES[firstByte];
  }

  var uri = uriPrefix;
  for (x = 0; x < uriData.length; x++) {
    debug('Convert uri: %s', String.fromCharCode(uriData[x]));
    if (uriData[x] < SUFFIXES.length) {
      uri += SUFFIXES[uriData[x]];
    } else {
      uri += String.fromCharCode(uriData[x]);
    }

  }
  return {
    flags: flags,
    txPower: txPower,
    uri: uri,
    rssi: rssi
  };
};

module.exports = UriBeaconScanner;
