const RETRY_COUNT = 5  //报名接口最大重试次数
const FIRST_REQUEST_INTERVAL = 50 //第一次请求的延迟时间，单位毫秒
const RETRY_INTERVAL = 10 //每次报名重试的时间间隔，单位毫秒

const HOST = "https://tmwz.sinogiantgroup.com/" //主域名
const DRIVER_ADD = HOST + "wechat/driver/add" //报名接口

function delay(waitTime) {
    return new Promise(resolve => setTimeout(resolve, waitTime));
}


module.exports = {
    RETRY_COUNT,
    RETRY_INTERVAL,
    HOST,
    DRIVER_ADD,
    delay
}
