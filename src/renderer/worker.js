// drift detection algorithm
const drift = require("../algorithm/drift.js")

// In renderer process (web page).
const ipcRenderer = require('electron').ipcRenderer

ipcRenderer.on('worker-read-log', function(event, path) {
    drift.readMXML(path, (err, activities, traces) => {
        if (err !== null) {
            ipcRenderer.send('worker-read-log', err.toString())
        } else {
            ipcRenderer.send('worker-read-log', null, activities.vals, traces, path)
        }
    })
})

