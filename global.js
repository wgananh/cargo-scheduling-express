const RETRY_COUNT = 30  //报名接口最大重试次数
const RETRY_INTERVAL = 200 //每次报名重试的时间间隔，单位毫秒

const HOST = "https://tmwz.sinogiantgroup.com/" //主域名
const GOODS_PREVIEW = HOST + "wechat/goodsPublish/getGoodsPublishInfo" //货单信息预览接口

module.exports = {
    RETRY_COUNT,
  RETRY_INTERVAL,
  HOST,
  GOODS_PREVIEW
}
