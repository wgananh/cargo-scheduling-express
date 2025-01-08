const { RETRY_COUNT, RETRY_INTERVAL, FIRST_REQUEST_INTERVAL, DRIVER_ADD, WX_PAY, delay, GET_PAY_PARAMS } = require("./global");
// 假设connect是一个保存所有WebSocket连接的对象
const connectWebSocket = new Map();
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
    // 超过重试次数，返回错误信息
    const userWs = connectWebSocket.get(req.headers['x-wx-openid']);
    if (userWs) {
      userWs.send(JSON.stringify({
        code: 1001,
        message: "报名失败，请重试!",
      }));
    }
    return;
  }

  const timestamp = new Date().getTime(); // 获取时间戳
  const timeString = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(attempt + " 报名中.. " + timeString + " 时间戳: " + timestamp);
  const openId = req.headers['x-wx-openid'];

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
      // 报名成功，获取支付参数
      const publishId = params.publishId; // 从请求参数中获取
      const openId = req.headers['x-wx-openid'];
      const amount = params.amount || 50; // 从请求参数中获取金额，默认50

      // 调用获取支付参数接口
      request(GET_PAY_PARAMS, {
        method: 'POST',
        body: JSON.stringify({
          publishId,
          openId,
          amount
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }, async (payErr, payResp, payBody) => {
        const userWs = connectWebSocket.get(openId);
        if (payErr) {
          if (userWs) {
            userWs.send(JSON.stringify({
              code: 1002,
              message: "获取支付参数失败",
              error: payErr
            }));
          }
          return;
        }

        try {
          const payData = JSON.parse(payBody);
          if (payData.code === "0") {
            // 发送支付参数给前端
            if (userWs) {
              userWs.send(JSON.stringify({
                code: 1000,
                message: "报名成功，请完成支付",
                data: payData.data
              }));
            }
          } else {
            if (userWs) {
              userWs.send(JSON.stringify({
                code: 1003,
                message: payData.msg || "获取支付参数失败",
              }));
            }
          }
        } catch (error) {
          if (userWs) {
            userWs.send(JSON.stringify({
              code: 1004,
              message: "解析支付参数失败",
              error
            }));
          }
        }
      });
    }
  });
};


const wxPay = async (orderNo, openId) => {
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
      const userWs = connectWebSocket.get(openId);
      if (userWs) {
        userWs.send(JSON.stringify({
          code: 1000,
          message: "报名成功!",
          data: JSON.stringify(data)
        }));
      } else {
        console.error("WebSocket连接不存在，无法发送消息");
      }
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
  let openid = req.headers['x-wx-openid']
  if (openid == null) {
    openid = new Date().getTime() // 使用时间戳作为临时ID不太安全
  }

  // 当前代码注释掉了重复连接检查，建议恢复并优化：
  const existingWs = connectWebSocket[openid];
  if (existingWs && existingWs.readyState === 1) { // 1 表示连接打开状态
    ws.send(JSON.stringify({
      code: 1006,
      message: "当前用户已在其他设备连接"
    }));
    ws.close();
    return;
  }

  // 连接记录到数据库
      await WebSocketConnection.upsert({
        openid: openid,
        isConnected: true,
        lastConnectedAt: new Date(),
        source: req.headers['x-wx-source'] || '非微信',
        unionid: req.headers['x-wx-unionid'] || '-',
        ip: req.headers['x-forwarded-for'] || '未知',
      });

  connectWebSocket[openid] = ws;

  // 心跳检测机制缺失，建议添加
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'heartbeat' }));
    }
  }, 30000); // 每30秒发送一次心跳

      ws.on('message', function (msg) {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'heartbeat') {
        ws.send(JSON.stringify({ type: 'heartbeat_response' }));
        return;
      }
      // 处理其他消息...
      console.log('收到消息：', msg);
      ws.send(`收到-${msg}`);
    } catch (error) {
      console.error('消息处理错误:', error);
    }
  });

    ws.on('close', async function (code, reason) {
    clearInterval(heartbeatInterval); // 清理心跳定时器
      console.log('链接断开:', openid, ' code:', code, ' reason:', reason);
    
    delete connectWebSocket[openid]; // 清理连接记录

    // 更新数据库连接状态
      await WebSocketConnection.update({
      isConnected: false,
      lastConnectedAt: new Date() // 记录断开时间
      }, {
        where: { openid: openid }
      });
  });

  ws.on('error', function(error) {
    console.error('WebSocket错误:', openid, error);
    clearInterval(heartbeatInterval);
    delete connectWebSocket[openid];
  });
});

// 支付结果通知接口
app.post("/api/pay/notify", async (req, res) => {
  const { orderNo, status } = req.body;
  const openId = req.headers['x-wx-openid'];
  
  // 处理支付结果
  const userWs = connectWebSocket.get(openId);
  if (userWs) {
    if (status === 'success') {
      userWs.send(JSON.stringify({
        code: 1000,
        message: "支付成功!",
        data: { orderNo }
      }));
    } else {
      userWs.send(JSON.stringify({
        code: 1005,
        message: "支付失败",
        data: { orderNo }
      }));
    }
  }
  
  res.send({
    code: 0,
    message: "通知处理成功"
  });
});

const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();

// 建议添加一个统一的消息发送方法
const sendWebSocketMessage = (openid, message) => {
  const ws = connectWebSocket[openid];
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('发送消息失败:', error);
      return false;
    }
  }
  return false;
};

// 使用示例
sendWebSocketMessage(openid, {
  code: 1000,
  message: "报名成功，请完成支付",
  data: payData.data
});
