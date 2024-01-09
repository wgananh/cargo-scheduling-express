const RETRY_COUNT = 30  //报名接口最大重试次数
const RETRY_INTERVAL = 200 //每次报名重试的时间间隔，单位毫秒

const HOST = "https://tmwz.sinogiantgroup.com/" //主域名
const DRIVER_ADD = HOST + "wechat/driver/add" //报名接口

module.exports = {
    RETRY_COUNT,
    RETRY_INTERVAL,
    HOST,
    DRIVER_ADD
}
