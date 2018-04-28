"use strict"
const fs = require('fs')
const lazy = require('lazy.js')
const execFileSync = require('child_process').execFileSync;
const path = require('path')
const os = require('os')

const make2dArray = (w, h, initial) => new Array(h).fill(null).map(_ => new Array(w).fill(initial))
const randPick = function (arr) {
    if (!arr instanceof Array || !arr)
        return null
    return arr[Math.floor(Math.random() * arr.length)]
}

class VIMap {
    constructor() {
        this.vals = []
        this.idxs = {}
    }

    getIdx(val) {
        return this.idxs[key]
    }

    getVal(idx) {
        return this.vals[idx]
    }

    put(val) {
        const key = val.toString()
        if (!(key in this.idxs)) {
            this.idxs[key] = this.vals.length
            this.vals.push(val)
        }
        return this.idxs[key]
    }

    clear() {
        this.vals = []
        this.idxs = {}
    }
}

function detectInvariance(arr, MRID) {
    const N = arr.length
    let begin = -1
    let count = 0
    let intervals = []
    for (let i = 0; i < N; i++) {
        if (begin === -1 || arr[begin] !== arr[i]) {
            if (count >= MRID) {
                intervals.push([begin, i])
            }
            begin = i
            count = 0
        }
        count++
    }
    intervals.push([begin, N])
    // console.log('invariance:', intervals)
    return intervals
}

function getTrace(events) {
    // sort the events by endTime
    events.sort((a, b) => {
        return a.endTime - b.endTime
    })

    // make graph
    let enabled = []
    lazy(events).each(function (event, i) {
        event.tokens = 0
        event.threshold = 0

        let seq = lazy(events).slice(0, i).reverse().dropWhile(x => x.endTime > event.startTime)
        if (seq.isEmpty()) {
            enabled.push(event)
            return
        }

        let time = seq.last().startTime
        seq.takeWhile(x => {
            let flag = x.endTime.getTime() >= time
            if (x.startTime > time)
                time = x.startTime
            return flag
        }).each((x, _) => {
            event.threshold++
            x.next = x.next || []
            x.next.push(event)
        })
    })

    // generate trace
    let trace = []
    while (enabled.length > 0) {
        // random pick one event enabled
        let index = Math.floor(Math.random() * enabled.length)
        let event = enabled[index]

        // remove this event and add it into trace 
        enabled.splice(index, 1)
        trace.push(event.name)

        // add tokens
        lazy(event.next).each((value, _) => {
            value.tokens++
            if (value.tokens === value.threshold) {
                enabled.push(value)
            }
        })
        // console.log(enabled.map(x => x.name))
    }

    return trace
}

// readMXML parses a .mxml file and returns activities and traces.
// Schema of .mxml can be found at http://www.processmining.org/WorkflowLog.xsd.
function readMXML(filepath, callback) {
    let activities = new VIMap()

    // parse mxml tag: AuditTrailEntry
    let entryToObject = (entry) => lazy(entry.childNodes())
        .filter(item => ['workflowmodelelement', 'eventtype', 'timestamp'].indexOf(item.name().toLowerCase()) != -1)
        .map(item => [item.name().toLowerCase(), item.text().trim()])
        .toObject()

    // parse mxml tag: ProcessInstance
    let instanceToTrace = (instance) => {

        // not considering timestamp
        // let trace1 = entries.filter(item => item.EventType === 'assign')
        //     .map(item => activities.put(item.WorkflowModelElement))
        //     .toArray()

        // considering timestamp
        let toEvent = (items) => {
            let temp = lazy(items).groupBy('eventtype').toObject()
            return lazy(temp.assign)
                .zip(temp.complete)
                .map(([assign, complete]) => {
                    return {
                        name: activities.put(assign.workflowmodelelement),
                        startTime: new Date(assign.timestamp),
                        endTime: new Date(complete.timestamp)
                    }
                })
                .toArray()
        }


        let entries = lazy(instance.childNodes())
            .filter(item => item.name() === 'AuditTrailEntry')
            .map(entryToObject)
        let events = entries
            .groupBy('workflowmodelelement')
            .map(toEvent)
            .flatten()
        let trace2 = getTrace(events.toArray())
        // console.log('trace 1: ', trace1)
        // console.log('trace 2: ', trace2)
        // if (trace1.length != trace2.length) {
        //     throw ('error when extracting trace')
        // }
        return trace2
    }

    // parse mxml tag: Process
    let processToTraces = (process) => lazy(process.childNodes())
        .filter(item => item.name() === 'ProcessInstance')
        .map(instanceToTrace)
        .toArray()

    // 'aix','darwin','freebsd','linux','openbsd','sunos','win32'
    let platform_arch = os.platform() + '_' + process.arch
    let ext = ''
    if (os.platform() == 'win32') {
        ext = '.exe'
    }
    let bin = path.join(__dirname, '..', 'bin', platform_arch, 'mxmlreader' + ext)

    try {
        let output = execFileSync(bin, [filepath], {
            maxBuffer: 100 * 1024 * 1024,
            encoding: "UTF-8"
        })
        let obj = JSON.parse(output)

        if (obj.err) {
            callback(obj.err)
            return
        }

        let toEvent = (items) => {
            let temp = lazy(items).groupBy('type').toObject()
            return lazy(temp.assign).zip(temp.complete)
                .map(([assign, complete]) => {
                    return {
                        name: activities.put(assign.name),
                        startTime: new Date(assign.timestamp),
                        endTime: new Date(complete.timestamp)
                    }
                })
                .toArray()
        }
        let traces = lazy(obj.data).map(ins => {
            try {
                // condider assign and complete
                // let events = lazy(ins).groupBy('name').map(toEvent).flatten()
                // let trace = getTrace(events.toArray())

                // only condider complete
                let trace = lazy(ins).filter(event=>event.type === 'complete').map(event=>event.name).toArray()
                return trace
            } catch (e) {
                return null
            }
        }).filter(trace => trace != null).toArray()
        callback(null, activities, traces)
    } catch (e) {
        callback(e.toString())
        // console.log(e)
    }

    // fs.readFile(filepath, (err, data) => {
    //     try {
    //         let xmlDoc = libxml.parseXmlString(data)
    //         let process = xmlDoc.get('//Process')
    //         let traces = processToTraces(xmlDoc.get('//Process'))
    //         callback(null, activities, traces)
    //     } catch (e) {
    //         callback(e, null, null)
    //     } finally {
    //     }
    // })
}

class EventLog {
    init() {
        this.activities = []
        this.traces = []
        this.ids = {}
    }

    constructor(filepath) {
        if (filepath !== undefined && filepath !== null) {
            this.readMXML2(filepath)
        } else {
            this.init()
        }
    }

    length() {
        return this.traces.length
    }

    addActivity(activity) {
        if (!(activity in this.ids)) {
            this.ids[activity] = this.activities.length
            this.activities.push(activity)
        }
        return this.ids[activity]
    }

    readMXML2(filepath) {
        this.init()
        let content = fs.readFileSync(filepath)
        let xmlDoc = libxml.parseXmlString(content)
        let process = xmlDoc.get('//Process')


        let entryToEvent = (entry) => lazy(entry.childNodes())
            .filter(item => item.name() in ['WorkflowModelElement', 'EventType', 'timestamp'])
            .map(item => [item.name(), item.text().trim()])
            .toObject()

        let instanceToTrace = (instance) => {
            let events = lazy(instance.childNodes()).filter(item => item.name() === 'AuditTrailEntry').map(entryToEvent).toArray()
            return events
        }

        let processToTraces = (process) => lazy(process.childNodes()).filter(item => item.name() === 'ProcessInstance').map(instanceToTrace).toArray()

        let traces = lazy(process.childNodes()).filter(item => item.name() === 'ProcessInstance').map(instanceToTrace).toArray()
        for (let instance of process.childNodes()) {
            if (instance.name() !== 'ProcessInstance') {
                continue
            }
            let trace = []
            let events = [], events_incompleted = {}

            lazy(instance.childNodes())
                .filter(item => item.name() === 'AuditTrailEntry')
                .map(item => {

                })
            for (let item of instance.childNodes()) {
                if (item.name() !== 'AuditTrailEntry') {
                    continue
                }
                let entry = {}
                for (let child of item.childNodes()) {
                    switch (child.name()) {
                        case 'WorkflowModelElement':
                            entry['name'] = this.addActivity(child.text().trim())
                            break
                        case 'EventType':
                            entry['type'] = child.text().trim()
                            break
                        case 'timestamp':
                            entry['timestamp'] = child.text().trim()
                            break
                        default:
                            break
                    }
                }

                let key = entry.name.toString()
                if (!(key in events)) {
                    events[key] = {
                        name: entry.name
                    }
                }
                if (entry.type === 'assign') {
                    events[key].startTime = new Date(entry.timestamp)
                } else if (entry.type === 'complete') {
                    events[key].endTime = new Date(entry.timestamp)
                } else {
                    throw ('unexpected event type')
                }
                if (entry['type'] === 'assign') {
                    trace.push(entry['name'])
                }
            }

            let trace_new = getTrace(Object.values(events))
            if (trace_new.length != trace.length) {
                console.log("new: ", trace_new)
                console.log("old: ", trace)
                console.log(Object.values(events))
                break
            }

            if (trace) {
                this.traces.push(trace)
            }
        }
    }

    readMXML(filepath) {
        this.init()
        const content = fs.readFileSync(filepath)
        const xmlDoc = libxml.parseXmlString(content)
        const process = xmlDoc.get('//Process')
        for (let instance of process.childNodes()) {
            if (instance.name() !== 'ProcessInstance') {
                continue
            }
            let trace = []
            for (let item of instance.childNodes()) {
                if (item.name() !== 'AuditTrailEntry') {
                    continue
                }
                let entry = {}
                for (let child of item.childNodes()) {
                    switch (child.name()) {
                        case 'WorkflowModelElement':
                            entry['name'] = this.addActivity(child.text().trim())
                            break
                        case 'EventType':
                            entry['type'] = child.text().trim()
                            break
                        case 'timestamp':
                            entry['timestamp'] = child.text().trim()
                            break
                        default:
                            break
                    }
                }
                if (entry['type'] === 'assign') {
                    trace.push(entry['name'])
                }
            }

            if (trace) {
                this.traces.push(trace)
            }
        }
    }
}

class BIRelation {
    constructor(first, second) {
        this.first = first
        this.second = second
    }
    toString() {
        return '(' + this.first.toString() + ',' + this.second.toString() + ')'
    }
}


class DSR extends BIRelation {
    toString() {
        return this.first.toString() + '->' + this.second.toString()
    }

    static extract(trace) {
        return lazy(trace).consecutive(2).map(([a, b]) => new DSR(a, b))
    }
}


class WOR extends BIRelation {
    toString() {
        return this.first.toString() + '-->' + this.second.toString()
    }

    static extract(trace) {
        let relations = []
        for (let i = 0; i < trace.length - 1; i++) {
            for (let j = i + 1; j < trace.length; j++) {
                relations.push(new WOR(trace[i], trace[j]))
            }
        }
        return relations
    }
}

class CandidateChangePoint {
    constructor(pos, direction) {
        this.pos = pos
        this.direction = direction
    }
}

class Partition {
    constructor(range = [], intervals = []) {
        this.intervals = intervals;
        this.range = range;
    }

    // splits(MRID) {
    //     return lazy(this.intervals)
    //         .filter(interval => interval[1] - interval[0] >= MRID)
    //         .flatten()
    //         .uniq()
    //         .without(this.range)
    //         .toArray();
    // }

    splits(MRID) {
        return lazy(this.intervals)
            .filter(interval => interval[1] - interval[0] >= MRID)
            .map(interval=>[new CandidateChangePoint(interval[0], 'right'), new CandidateChangePoint(interval[1], 'left')])
            .flatten()
            .filter(p => (p.pos != this.range[0] && p.pos != this.range[1]))
     
            .toArray();
    }
}


class RelationMatrix {
    init() {
        this.relations = []
        this.relationsIds = {}
        this.data = []
        this.dataAccSum = []
        this.relationClasses = [DSR]
        this.width = 0
        this.height = 0
    }

    constructor(traces) {
        if (traces !== undefined) {
            this.transform(traces)
        } else {
            this.init()
        }
    }

    getRelations(left, right) {
        return this.dataAccSum.map(x => (x[right] - x[left] > 0))
    }

    transform(traces) {
        this.init()
        this.width = traces.length
        for (let rc of this.relationClasses) {
            for (let i = 0; i < this.width; i++) {
                for (let relation of rc.extract(traces[i])) {
                    let j = this.addRelation(relation)
                    this.data[j][i] = 1
                }
            }
        }
        this.height = this.relations.length

        this.dataAccSum = this.data.map(arr => {
            let sums = [0]
            arr.reduce((acc, v) => {
                let sum = acc + v
                sums.push(sum)
                return sum
            }, 0)
            return sums
        })
    }

    addRelation(relation) {
        const rkey = relation.toString()
        if (!(rkey in this.relationsIds)) {
            this.relationsIds[rkey] = this.relations.length
            this.relations.push(relation)
            this.data.push(new Array(this.width).fill(0))
        }
        return this.relationsIds[rkey]
    }

    partition(MRID) {
        return lazy(this.data).map(row => detectInvariance(row, MRID)).map(intervals => new Partition([0, this.width], intervals)).toArray()
    }

    static blank() {
        return new RelationMatrix()
    }
}


class Cluster {
    constructor(points) {
        this.points = points
        if (points.length == 0) {
            this.avg = this.min = this.max = 0
            return
        }

        this.points.sort((p1, p2) => p1.pos - p2.pos)

        let sum = points.reduce((acc, v) => acc + v.pos, 0)
        this.avg = parseInt(sum / points.length)
        this.min = this.points[0].pos
        this.max = this.points[this.points.length - 1].pos
    }

    size() {
        return this.points.length
    }

    toString() {
        return this.points.toString()
    }
}


function DBSCAN(points, radius, min_pts) {
    points.sort((p1, p2) => {
        return p1.pos - p2.pos
    })
    const n = points.length
    let leftBounds = lazy.range(n).toArray()
    let rightBounds = lazy.range(n).toArray()

    for (let i = 0; i < n; i++) {
        let j = rightBounds[i] + 1
        while (j < n && Math.abs(points[i].pos - points[j].pos) <= radius) {
            if (i < leftBounds[j]) {
                leftBounds[j] = i
            }
            j++
        }
        rightBounds[i] = j - 1
    }

    let clusters = []
    let begin = -1, end = n
    for (let i = 0; i < n; i++) {
        if (i > end) {
            clusters.push(new Cluster(points.slice(begin, end + 1)))
            begin = -1
            end = n
        }
        const count = rightBounds[i] - leftBounds[i] + 1
        if (count >= min_pts) {
            if (begin === -1) {
                begin = leftBounds[i]
            }
            end = rightBounds[i]
        }
    }
    if (begin >= 0) {
        clusters.push(new Cluster(points.slice(begin, end + 1)))
    }

    return clusters
}


function pickClusters(clusters, begin, end, MRID, k) {
    let drifts = [begin, end]

    let tryInsert = (pos) => {
        for (let i = 0; i < drifts.length; i++) {
            if (drifts[i] === pos) {
                break
            } else if (drifts[i] > pos) {
                if (pos - drifts[i - 1] >= MRID && drifts[i] - pos >= MRID) {
                    drifts.splice(i, 0, pos)
                    return true
                }
                return false
            }
        }
        return false
    }

    // sort the cluster in decending order of size
    clusters.sort((a, b) => b.size() - a.size())


    lazy(clusters).each(item => {
        item.selected = (item.size() >= k && tryInsert(item.avg))
    })
}

function getDrifts(relationMatrix, clusters) {
    // set operations
    const union = (s1, s2) => lazy(s1).zip(s2).map(([a, b]) => (a || b)).toArray();
    const isSubSet = (s1, s2) => lazy(s1).zip(s2).every(([a, b]) => (!a || (a && b)));

    // get all phases
    // each phase is an object
    let phases = lazy([new Cluster([new CandidateChangePoint(0, 'right')])])
        .concat(clusters)
        .concat([new Cluster([new CandidateChangePoint(relationMatrix.width, 'left')])])
        .consecutive(2)
        .map(([lc, rc]) => ({
            left: lc.avg,
            right: rc.avg,
            relations: relationMatrix.getRelations(lc.max, rc.min)
        }))
        .memoize();


    // determine whether each phase is a gradual drift
    let isGradualDrift = lazy([null])
        .concat(phases.map(item => item.relations).toArray())
        .concat([null])
        .consecutive(3)
        .map(([left, mid, right]) => {
            return (left !== null &&
                right !== null &&
                isSubSet(mid, union(left, right)) &&
                !isSubSet(mid, left) &&
                !isSubSet(mid, right))
        })
        .toArray();

    // get all drifts, including sudden drifts and gradual drifts
    let drifts = [];
    phases.zip(isGradualDrift).reduce((prev, [phase, flag]) => {
        if (prev) return false
        if (flag) {
            drifts.push([phase.left, phase.right])
        } else {
            drifts.push(phase.left)
        }
        return flag
    }, false);
    drifts.push(relationMatrix.width)

    console.log(drifts)

    return drifts
}


function detect(filepath) {
    let log = new EventLog(filepath)
    let matrix = new RelationMatrix(log)
    for (let i = 0; i < matrix.relations.length; i++) {
        const relation = matrix.relations[i]
        const arr = matrix.data[i]

        if (relation.first == log.ids['j'] && relation.second == log.ids['m']) {
            console.log(lazy.range(0, 1250, 250).map(x => lazy(arr).slice(x, x + 250).sum()).toArray())
            // console.log(detectInvariance(arr, 100))
        }

    }
    let partitions = matrix.partition(100)
    for (let i of lazy.range(partitions.length)) {
        console.log(i, partitions[i].intervals)
    }
    // let points = []
    // for (let partition of partitions) {
    //     points = points.concat(partition.splits(300))
    // }
    // let clusters = DBSCAN_1d(points, 20, 1)
    // let clustersPicked = pickClusters(clusters, 0, log.length(), 300)
    // const drifts = getDrifts(matrix, clustersPicked)
    // console.log(...drifts)
}



exports.readMXML = readMXML
exports.EventLog = EventLog
exports.RelationMatrix = RelationMatrix
exports.DBSCAN = DBSCAN
exports.pickClusters = pickClusters
exports.getDrifts = getDrifts

// detect('E:\\BPM\\process-drift-detection\\mixed_logs\\my-loan\\grad-model-model_pm-1000-250-10.mxml')
// console.log(DBSCAN_1d([1, 2, 13, 14, 15, 20, 21, 90, 13, 14, 15, 20], 2, 1))

