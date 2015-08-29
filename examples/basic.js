var EddystoneBeaconScanner = require('../'); // use require('eddystone-beacon-scanner'), if installed from npm

EddystoneBeaconScanner.on('didFindBeacon', function(beacon) {
  console.log('discovered Eddystone Beacon:\n', beacon);
});

EddystoneBeaconScanner.on('didLoseBeacon', function(beacon) {
  console.log('Lost Eddystone Beacon:\n', beacon);
});

EddystoneBeaconScanner.startScanning(true);
