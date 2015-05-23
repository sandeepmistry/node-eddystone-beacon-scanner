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

  // make sure service data is present, with the expected uuid
  return (serviceData && serviceData[0].data.length > 1 && serviceData[0].uuid === SERVICE_UUID);
};

UriBeaconScanner.prototype.parseUriBeacon = function(peripheral) {
  var rssi = peripheral.rssi;
  var data = peripheral.advertisement.serviceData[0].data;

  var flags = data.readUInt8(0); // flag is the 1st byte
  var txPower = data.readInt8(1); // TX Power is 2nd byte
  var uriData = data.slice(2); // remainder in the URI

  var uriPrefix = '';
  var uriSuffix = '';

  var firstByte = data[0];
  var lastByte = data[data.length - 1];

  // decode prefix, if needed
  if (firstByte < PREFIXES.length) {
    uriPrefix = PREFIXES[firstByte];
    data = data.slice(1);
  }

  // decode suffic, if needed
  if (lastByte < SUFFIXES.length) {
    uriSuffix = SUFFIXES[lastByte];
    data = data.slice(0, data.length - 1);
  }

  // assemble URI
  var uri = uriPrefix + uriData.toString() + uriSuffix;

  return {
    flags: flags,
    txPower: txPower,
    uri: uri,
    rssi: rssi
  };
};

module.exports = UriBeaconScanner;
