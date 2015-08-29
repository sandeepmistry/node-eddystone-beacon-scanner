var EddystoneBeaconScanner = require('../'); // use require('uri-beacon-scanner'), if installed from npm

EddystoneBeaconScanner.on('didFindBeacon', function(uriBeacon) {
  console.log('discovered Eddystone Beacon:');
  console.log(uriBeacon);
});

EddystoneBeaconScanner.on('didLoseBeacon', function(uriBeacon) {
  console.log('Lost Eddystone Beacon:');
  console.log(uriBeacon);
});

EddystoneBeaconScanner.startScanning(true);
