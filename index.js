const { RETRY_COUNT, RETRY_INTERVAL, FIRST_REQUEST_INTERVAL, DRIVER_ADD, WX_PAY, delay } = require("./global");
// 假设connect是一个保存所有WebSocket连接的对象
const connectWebSocket = {};
const connectOpenid = {};

const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { init: initDB, Counter, WebSocketConnection } = require("./db");
const logger = morgan("tiny");
const request = require('request');
const app = express();
require('express-ws')(app)

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);


// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// // 更新计数
// app.post("/api/count", async (req, res) => {
//   const { action } = req.body;
//   if (action === "inc") {
//     await Counter.create();
//   } else if (action === "clear") {
//     await Counter.destroy({
//       truncate: true,
//     });
//   }
//   res.send({
//     code: 0,
//     data: await Counter.count(),
//   });
// });
//
// // 获取计数
// app.get("/api/count", async (req, res) => {
//   const result = await Counter.count();
//   res.send({
//     code: 0,
//     data: result,
//   });
// });

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

// 需要使用 body-parser 处理 JSON 数据
// 小程序调用，获取获取用户手机号
app.post('/api/phone', async (req, res) => {
  // 拼接 Header 中的 x-wx-openid 到接口中
  const api = `http://api.weixin.qq.com/wxa/getopendata?openid=${req.headers['x-wx-openid']}`;
  request(api, {
    method: 'POST',
    body: JSON.stringify({
      cloudid_list: [req.body.cloudid], // 传入需要换取的 CloudID
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  }, (err, resp, body) => {
    try {
      const data = JSON.parse(body).data_list[0]; // 从回包中获取手机号信息
      const phone = JSON.parse(data.json).data.phoneNumber;
      // 将手机号发送回客户端，此处仅供示例
      // 实际场景中应对手机号进行打码处理，或仅在后端保存使用
      res.send(phone);
    } catch (error) {
      res.send('get phone failed');
    }
  });
});

const addDriver = async (api, params, attempt = 1, res, req) => {
  if (attempt > RETRY_COUNT) {
    return;
  }

  const timestamp = new Date().getTime(); // 获取时间戳
  const timeString = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(attempt + " 报名中.. " + timeString + " 时间戳: " + timestamp);
  const openId = req.headers['x-wx-openid'];
  console.log(openId, " connectWebSocket111111: ", JSON.stringify(connectWebSocket));
  console.log(" connectOpenid: ", JSON.stringify(connectOpenid));
  const userWs = connectWebSocket[openId];
  if (userWs) {
    userWs.send(JSON.stringify({ message: attempt + " socket报名中.. " + timeString + " 时间戳: " + timestamp, data: {} }));
  } else {
    console.error("WebSocket连接不存在，无法发送消息");
  }

  request(api, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: {
      'Content-Type': 'application/json',
    },
  }, async (err, resp, body) => {
    console.log("attempt:" + attempt + " resp:" + JSON.stringify(resp));
    console.log("attempt:" + attempt + " body:" + JSON.stringify(body));
    console.log("attempt:" + attempt + " err:" + JSON.stringify(err));
    const resultData = JSON.parse(body);
    const { msg, code, data } = resultData;
    if (err || code !== 0) {
      await delay(RETRY_INTERVAL);
      await addDriver(api, params, attempt + 1, res, req);
    } else {
      const orderNo = data;
      if (orderNo && orderNo.length > 0) {
        await wxPay(orderNo)
      }
    }
  });
};


const wxPay = async (orderNo) => {
  let params = {
    orderNo
  };
  request(WX_PAY, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: {
      'Content-Type': 'application/json',
    },
  }, async (err, resp, body) => {
    console.log("wxPay:" + attempt + " resp:" + JSON.stringify(resp));
    console.log("wxPay:" + attempt + " body:" + JSON.stringify(body));
    console.log("wxPay:" + attempt + " err:" + JSON.stringify(err));
    const resultData = JSON.parse(body);
    const { msg, success, data } = resultData;
    if (success) {
      const payData = data;
      //payData发送给客户端
    }
  });
}

//货单预定接口
//首先检查当前时间是否已经达到 startTime。如果已经达到或超过，我们立即调用 requestOpenData 函数来执行请求。如果还没有到达，我们使用 setTimeout 设置一个延迟，延迟时间是 startTime 与当前时间的差值。
//requestOpenData 函数是一个递归函数，它会尝试请求微信的接口，如果请求失败或遇到错误，它会通过 setTimeout 在1秒后重试，最多重试30次。每次重试都会增加 attempt 参数的计数。如果请求成功，它会尝试解析手机号并将其发送回客户端。如果解析失败，它也会重试，直到成功或达到最大尝试次数。
app.post("/api/book", async (req, res) => {
  const openId = req.headers['x-wx-openid'];
  const api = DRIVER_ADD;
  const { startTime } = req.body;
  let params = {
    openId,
    ...req.body
  };

  const currentTime = new Date().getTime();
  const waitTime = new Date(startTime).getTime() - currentTime;
  console.log(openId + " waitTime:" + waitTime + " currentTime:" + currentTime);
  if (waitTime <= 0) {
    res.send('正在报名中...');
    await addDriver(api, params, 1, res, req);
  } else {
    console.log("openId:" + openId + ' 预定请求已接收，正在处理中... ' + " waitTime:" + waitTime + " currentTime:" + currentTime);
    res.send('预定请求已接收，正在处理中...');
    // 等待预定时间到达后再执行预定操作
    await delay(waitTime + FIRST_REQUEST_INTERVAL);
    await addDriver(api, params, 1, res, req);
  }
});

app.post("/api/check", async (req, res) => {
  const openId = req.headers['x-wx-openid'];
  const api = DRIVER_ADD;
  let params = {
    openId,
    ...req.body
  }
  request(api, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: {
      'Content-Type': 'application/json',
    },
  }, (err, resp, body) => {
    console.log("checkIsAddDriver_resp:" + JSON.stringify(resp));
    console.log("checkIsAddDriver_body:" + JSON.stringify(body));
    console.log("checkIsAddDriver_err:" + JSON.stringify(err));
    const resultData = JSON.parse(body);
    const { msg } = resultData;
    res.send(msg);
  });
});


app.ws('/checkStatus', async function (ws, req) {
  let openid = req.headers['x-wx-openid'] // 从header中获取用户openid信息
  if (openid == null) { // 如果不存在则不是微信侧发起的
    openid = new Date().getTime() // 使用时间戳代替
  }

    // 先查询数据库中该openid的连接状态
    const existingConnection = await WebSocketConnection.findOne({
      where: { openid: openid }
    });

    if (existingConnection && existingConnection.isConnected) {
      // 如果已经存在活动连接，发送重复连接信息并关闭WebSocket
      ws.send('当前用户已经在其他设备连接过，无法重复连接');
      ws.close();
    } else {
      // 如果没有活动连接，创建或更新数据库记录
      await WebSocketConnection.upsert({
        openid: openid,
        isConnected: true,
        lastConnectedAt: new Date(),
        source: req.headers['x-wx-source'] || '非微信',
        unionid: req.headers['x-wx-unionid'] || '-',
        ip: req.headers['x-forwarded-for'] || '未知',
      });

      console.log('链接请求头信息', req.headers)
      connectWebSocket[openid] = ws;

      ws.on('message', function (msg) {
      console.log('收到消息：', msg)
      ws.send(`收到-${msg}`)
    })

    ws.on('close', async function (code, reason) {
      console.log('链接断开:', openid, ' code:', code, ' reason:', reason);
      // 更新数据库中的WebSocket连接状态记录
      await WebSocketConnection.update({
        isConnected: false
      }, {
        where: { openid: openid }
      });
    })
  }
})

// app.ws('/checkStatus', async function (ws, req) {
//   let openid = req.headers['x-wx-openid'] // 从header中获取用户openid信息
//   if (openid == null) { // 如果不存在则不是微信侧发起的
//     openid = new Date().getTime() // 使用时间戳代替
//   }
//   if (connectOpenid[openid] != null) { // 判断用户是否有连接
//     ws.send('当前用户已经在其他设备连接过，无法重复连接') // 发送重复连接信息
//     ws.close() // 关闭连接
//   } else {
//     connectOpenid[openid] = { // 记录用户信息
//       openid: openid, // 用户openid
//       source: req.headers['x-wx-source'] || '非微信', // 用户微信来源
//       unionid: req.headers['x-wx-unionid'] || '-', // 用户unionid
//       ip: req.headers['x-forwarded-for'] || '未知' // 用户所在ip地址
//     }
//     connectWebSocket[openid] = ws;
//     const visitedObjects = new WeakSet();
//     console.log(openid, " connectWebSocket00000: ", JSON.stringify(connectWebSocket, (key, value) => {
//       if (typeof value === 'object' && value !== null) {
//         if (visitedObjects.has(value)) {
//           return; // Avoid circular reference
//         }
//         visitedObjects.add(value);
//       }
//       return value;
//     }));
//     console.log('链接请求头信息', req.headers)
//     ws.on('message', function (msg) {
//       console.log('收到消息：', msg)
//       ws.send(`收到-${msg}`)
//     })
//     ws.on('close', function () {
//       console.log('链接断开：', openid)
//       delete connectOpenid[openid]
//     })
//   }
// })


const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
