!function(e){function n(r){if(o[r])return o[r].exports;var t=o[r]={i:r,l:!1,exports:{}};return e[r].call(t.exports,t,t.exports,n),t.l=!0,t.exports}var o={};n.m=e,n.c=o,n.d=function(e,o,r){n.o(e,o)||Object.defineProperty(e,o,{configurable:!1,enumerable:!0,get:r})},n.n=function(e){var o=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(o,"a",o),o},n.o=function(e,n){return Object.prototype.hasOwnProperty.call(e,n)},n.p="",n(n.s=1)}([function(e,n){e.exports=require("electron")},function(e,n,o){function r(){(f=new l({width:1e3,height:600,minWidth:640,minHeight:480,backgroundColor:"#ffffff"})).loadURL(c.format({pathname:u.join(__dirname,"./renderer/index.html"),protocol:"file:",slashes:!0})),f.on("closed",function(){f=null,s.destroy(),s=null}),(s=new l({width:1e3,height:600,show:!1})).loadURL(c.format({pathname:u.join(__dirname,"renderer/worker.html"),protocol:"file:",slashes:!0}))}const t=o(0),i=t.app,l=t.BrowserWindow,a=o(0).ipcMain,u=o(2),c=o(3);let f,s;a.on("worker-read-log",function(e,n,o,r,t){console.log(t),f.webContents.send("read-log",n,o,r,t)}),a.on("read-log",function(e,n){s.webContents.send("worker-read-log",n)}),i.on("ready",r),i.on("window-all-closed",function(){"darwin"!==process.platform&&i.quit()}),i.on("activate",function(){null===f&&r()})},function(e,n){e.exports=require("path")},function(e,n){e.exports=require("url")}]);