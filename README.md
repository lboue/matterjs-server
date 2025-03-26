# HomeAssistant Matter.js Server

This is a WIP version of a Matter.js based controller with a Python Matter Server compatible WebSocket interface.

## How to use
* clone the repository
* `npm i` in the root directory to install npm dependencies and do initial build
* (`npm run build`) if ever needed after changing code
* `npm run server` to start it

The server is started on port localhost:5580 and listens fpr WS on "/ws".

Just configure the HA instance against this server and have fun :-)

### Tips
* to control the storage directory use `--storage-path=.ha1` as parameter to use local dir `.ha1` for storage
* to limit network interfaces (especially good idea on Macs sometimes) use  `--mdns-networkinterface=en0`

So as example to do both use `npm run server -- --storage-path=.ha1 --mdns-networkinterface=en0` (note the extra "--" to pass parameters to the script).

It was in general tested with a simply slight bulb on network.

Ble and Wifi should work when server gets startes with `--ble` flag, but Wifi only will work. For Thread Mater.js currently requires a network Name which is not provided.
