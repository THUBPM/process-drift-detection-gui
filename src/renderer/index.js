// drift detection algorithm
const drift = require("../algorithm/drift.js")

// electron modules
const remote = require("electron").remote
const dialog = remote.dialog

// utilities
const lazy = require("lazy.js")

// html dom  
const $ = require("jquery")
const echarts = require("echarts")
const Vue = require("vue")


// In renderer process (web page).
const ipcRenderer = require('electron').ipcRenderer;


ipcRenderer.on('read-log', function (event, err, activities, traces, path) {
    if (err !== null) {
        app.$refs.message.show("日志加载失败!", err.toString(), 'error')
        console.log(err)
    } else if (traces.length == 0) {
        app.$refs.message.show("日志加载失败", "未能从日志文件中发现任何轨迹", 'error')
        console.log(err)
    } else {
        app.activities = activities
        app.traces = traces

        app.matrix = drift.RelationMatrix.blank()
        app.candidates = []
        app.clusters = []
        app.drifts = []
        app.$refs.message.show("日志加载成功!", "", 'success')
        app.filePath = path
    }
    app.isLoading = false
})


Vue.component("message", {
    template: `
    <div class="ui message" v-bind:class="[type]" style="display:none">
        <i class="close icon" v-show="!autoDismiss" v-on:click="close"></i>
        <div class="header">
            {{title}}
        </div>
        <p>{{detail}}</p>
    </div>
    `,
    data: function () {
        return {
            title: '',
            detail: '',
            type: '',
            autoDismiss: false
        }
    },
    methods: {
        close: function () {
            $(this.$el).slideUp(150)
        },
        show: function (title, description = "", type = "", autoDismiss = false, delay = 3000) {
            this.title = title
            this.detail = description
            this.type = type
            this.autoDismiss = autoDismiss
            $(this.$el).slideDown(150)
            if (this.autoDismiss) {
                let that = this
                setTimeout(() => {
                    that.close()
                }, delay);
            }
        }
    }
})

// Vue component: drift-vis
// Visulization for drifts
Vue.component("drift-vis", {
    template: '<div style="width:100%" v-show="shouldRender"></div>', //
    props: ['drifts'],
    data: function () {
        return {
            // drifts: [0, 12, 29, [34, 59], [79, 100], 120]
        }
    },
    mounted: function () {
        this.elChart = echarts.init(this.$el)
        this.elChart.setOption({
            // title: {
            //     text: '日志中的漂移现象',
            //     left: 'center',
            //     padding: 5, 
            // },
            grid: {
                left: 40,
                right: 30,
                top: 10,
                bottom: 20
            },
        })

        const elChart = this.elChart
        const onresize = window.onresize
        window.onresize = (...args) => {
            if (onresize) onresize.apply(this, args)
            elChart.resize()
        }

        this.render()
    },
    watch: {
        drifts: function () {
            this.render()
        }
    },
    computed: {
        shouldRender: function () {
            return (this.drifts instanceof Array) && this.drifts.length >= 2
        }
    },
    methods: {
        render: function () {
            if (!this.shouldRender) return false

            let phases = []
            let begin = this.drifts[0]
            for (let i = 1; i < this.drifts.length; i++) {
                if (this.drifts[i] instanceof Array) {
                    phases.push([begin, this.drifts[i][1]])
                    begin = this.drifts[i][0]
                } else {
                    phases.push([begin, this.drifts[i]])
                    begin = this.drifts[i]
                }
            }

            let models = lazy.range(phases.length).map(i => 'M' + i).toArray()

            let option = {
                yAxis: {
                    type: 'category',
                    splitLine: { show: false },
                    data: models
                },
                xAxis: {
                    type: 'value',
                    max: lazy(this.drifts).last(),
                    splitNumber: 10
                },
                series: [
                    {
                        name: 'offset',
                        type: 'bar',
                        stack: 'lifetime',
                        itemStyle: {
                            normal: {
                                barBorderColor: 'rgba(0,0,0,0)',
                                color: 'rgba(0,0,0,0)'
                            },
                            emphasis: {
                                barBorderColor: 'rgba(0,0,0,0)',
                                color: 'rgba(0,0,0,0)'
                            }
                        },
                        data: lazy(phases).map(x => x[0]).toArray()
                    },
                    {
                        name: 'lifetime',
                        type: 'bar',
                        stack: 'lifetime',
                        label: {
                            normal: {
                                show: true,
                                position: 'inside',
                                formatter: function (params) {
                                    let interval = phases[params.dataIndex]
                                    return `[${phases[params.dataIndex][0]}, ${phases[params.dataIndex][1]})`
                                }
                            },
                        },
                        data: lazy(phases).map(([l, r]) => r - l).toArray()
                    },
                    { // For shadow
                        type: 'bar',
                        itemStyle: {
                            normal: { color: 'rgba(0,0,0,0.05)' }
                        },
                        barGap: '-100%',
                        barCategoryGap: '40%',
                        data: lazy(phases).map(x => lazy(this.drifts).last()).toArray(),
                        // animation: false
                    },
                    // {
                    //     type: 'lines',
                    //     coordinateSystem: 'cartesian2d',
                    //     lineStyle: {
                    //         type: 'dotted'
                    //     },
                    //     data: lazy(this.drifts).flatten().map(item=>{
                    //         return {
                    //             coords: [
                    //                 [item, 0],  // 起点
                    //                 [item, phases.length]   // 终点
                    //             ],
                    //         }
                    //     }).toArray()
                    // }
                ]
            }

            this.elChart.setOption(option)
        },
        resize: function () {
            // 先设定高度，避免重新绘制带来的闪动
            this.elChart.getDom().style.height = (40 * this.drifts.length) + 'px'
            // resize不带参数表示自动读取所在的dom元素的长度和宽度
            this.elChart.resize()
        }
    },
    updated: function () {
        this.$nextTick(function () {
            // Code that will run only after the
            // entire view has been re-rendered

            this.resize()
        })
    }
})


// Vue component: 
Vue.component("drift-chart-view", {
    template: '<div style="width:100%"></div>',
    props: ['matrix', 'candidates', 'clusters'],
    data: function () {
        return {

        }
    },
    mounted: function () {
        this.elChart = echarts.init(this.$el)
        this.elChart.setOption({
            title: {
                text: '候选变更点分布',
                left: 'center',
                padding: [5, 5, 20, 5]
            },
            grid: {
                left: 30,
                right: 30,
            },
            legend: {

            }
        })

        const elChart = this.elChart
        const onresize = window.onresize
        window.onresize = (...args) => {
            if (onresize) onresize.apply(this, args)
            elChart.resize()
        }
    },
    computed: {
        // 把每一个类簇转化成向量
        vmClusters: function () {
            return this.clusters.map(x => [x.min, x.max, x.avg, x.selected, this.matrix.height + 1])
        },
        // vmCandidates: function () {
        //     let candidates = lazy(this.candidates)
        //         .groupBy((item) => this.matrix.relations[item[1]].toString(), (item)=>item[0])
        //         .memoize()
        //     return [memoize.keys().toArray(), memoize.values().toArray()]
        // }
    },
    watch: {
        // 监视活动关系矩阵，更新图表
        matrix: function () {
            const option = {
                xAxis: {
                    name: "trace 序号",
                    nameGap: "24",
                    nameLocation: "center",
                    min: 0,
                    max: this.matrix.width
                },
                yAxis: {
                    name: "活动关系",
                    // type: 'category',
                    // splitLine: { show: false },
                    // data: keys
                    min: 0,
                    max: this.matrix.height + 1,
                    interval: 1
                },
                tooltip: {

                },
                series: []
            }
            this.elChart.setOption(option)
        },
        // 监视候选变更点的变化，更新图表
        candidates: function () {
            this.renderCandidates()
        },
        // 监视点簇的变化，更新图表
        clusters: function () {
            this.renderClusters()
        }
    },
    methods: {
        renderCandidates: function () {
            // 先设定高度，避免重新绘制带来的闪动
            this.elChart.getDom().style.height = (15 * this.matrix.height + 30).toString() + 'px'
            // resize不带参数表示自动读取所在的dom元素的长度和宽度
            this.elChart.resize()

            // let [keys, values] = this.vmCandidates

            const series = lazy(this.elChart.getOption().series).filter(value => value.name !== '候选变更点').toArray()
            series.push({
                name: '候选变更点',
                type: 'scatter',
                data: lazy(this.candidates).map(([point, i])=>[point.pos, i]).toArray(),
                tooltip: {
                    formatter: (params) => {
                        const pos = params.data[0]
                        const relation = this.matrix.relations[params.data[1] - 1].toString()
                        return `候选变更点<br />位置：${pos}<br />关系：${relation}`
                    }
                }
            })
            points = lazy(series[series.length-1].data).map(p=>p.toString()).toArray().join("\n")
            console.log(points)
            
            this.elChart.setOption({

                series: series
            })
        },
        renderClusters: function () {
            const series = lazy(this.elChart.getOption().series).filter(value => value.name !== '候选点簇').toArray()

            series.push({
                name: '候选点簇',
                type: 'custom',
                renderItem: (params, api) => {
                    let yValue = api.value(4)
                    let start = api.coord([api.value(0), yValue]);
                    let size = api.size([api.value(1) - api.value(0), yValue]);
                    let selected = api.value(3)


                    return {
                        type: 'rect',
                        shape: {
                            x: start[0] - 10,
                            y: start[1],
                            width: size[0] + 20,
                            height: size[1]
                        },
                        style: {
                            fill: selected ? 'rgba(97,160,168,0.5)' : 'rgba(0,0,0,0.15)',
                            stroke: '#fefefe',
                            lineWidth: 0,
                            shadowBlur: 0,
                            shadowOffsetX: 0,
                            shadowOffsetY: 0,
                            shadowColor: 'rgba(0,0,0,0.3)'
                        }
                    };
                },
                label: {
                    normal: {
                        show: false,
                        position: 'top'
                    }
                },
                encode: {
                },
                tooltip: {
                    formatter: (params) => {
                        let cluster = this.clusters[params.dataIndex]
                        return `候选点簇<br/>
                                中心：${cluster.avg}<br/>
                                大小：${cluster.size()}`
                    }
                },
                data: this.vmClusters
            })

            this.elChart.setOption({
                series: series
            })
        }

    }
})

const app = new Vue({
    el: '#app',
    data: {
        // Control
        isLoading: false,
        showDrifts: false,

        // Data
        filePath: '',
        traces: [],
        activities: null,
        matrix: drift.RelationMatrix.blank(),
        candidates: [],
        clusters: [],
        drifts: [],

        // parameter
        parameter: {
            initialMRID: 100,
            MRID: 100,
            radius: 50,
            k: 1,
        },
    },
    mounted: function () {
        if (this.activities === null) {
            this.$refs.message.show(
                '请先加载日志',
                '点击右上角“打开文件”按钮，选择您要加载的日志文件。（注意：支持日志格式为.mxml)',
                'info',
                false
            )
        }
    },
    computed: {
        vmActivities: function () {
            if (this.activities === null) {
                return []
            } else {
                return this.activities.vals
            }
        }
    },
    methods: {
        /* 
         * dom event handler
         */
        MRIDChanged: function (event) {
            this.parameter.radius = parseInt(this.parameter.MRID / 2)
            this.detectCandidates()
            this.combineCandidates()
        },
        radiusChanged: function (event) {
            this.combineCandidates()
        },
        kChanged: function (event) {
            this.combineCandidates()
        },
        openFile: function () {
            this.isLoading = true

            // show dialog
            let paths = dialog.showOpenDialog(remote.getCurrentWindow(), {
                filters: [
                    { name: 'mxml', extensions: ['mxml'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            })

            // If the user cancels the dialog, paths will be undefined.
            // Otherwise, paths will be an array. 
            if (paths === undefined) {
                this.isLoading = false
                return
            }
            ipcRenderer.send('read-log', paths[0])
        },
        detect: function () {
            // console.time()
            // initialize parameters
            this.parameter.MRID = this.parameter.initialMRID
            this.parameter.radius = parseInt(this.parameter.MRID / 2)
            this.parameter.k = 1

            // transform the log into a relation matrix and 
            // partition each relation with the initialMRID parameter
            this.matrix = new drift.RelationMatrix(this.traces)
            this.partitions = this.matrix.partition(this.parameter.initialMRID)

            // detect candidates
            this.detectCandidates()

            // combine candidates
            // this.combineCandidates()
            console.timeEnd()
        },

        /* 
         * utility methods
         */
        detectCandidates: function () {
            let candidates = []
            // i is the relation index
            for (let i = 0; i < this.partitions.length; i++) {
                // Here note that we use the MRID parameter, not initialMRID 
                const splits = this.partitions[i].splits(this.parameter.MRID)

                for (let split of splits) {
                    // Split represents the position
                    // Using i+1 instead of i to make points above x-aixs in the chart.
                    candidates.push([split, i + 1])
                }
            }
            this.candidates = candidates
        },

        combineCandidates: function () {
            // The elements of candidates are 2d points.
            // We only need trace index (first dimension) for clustering
            let points = this.candidates.map(x => x[0])

            // Apply DBSCAN to candidate change positions
            let clusters = drift.DBSCAN(points, this.parameter.radius, 1)

            // Select valid clusters
            drift.pickClusters(clusters, 0, this.traces.length, this.parameter.MRID, this.parameter.k)
            clusters.sort((a, b) => a.min - b.min)

            // Store clusters
            this.clusters = clusters

            // Get drifts
            this.drifts = drift.getDrifts(this.matrix, lazy(clusters).filter(x => x.selected).toArray())
            console.log(...this.drifts)
        },
    },
    updated: function () {
        if (this.showDrifts) {
            this.$refs.driftVis.resize()
        }
    }
})




