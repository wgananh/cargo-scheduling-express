const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { init: initDB, Counter } = require("./db");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 更新计数
app.post("/api/count", async (req, res) => {
  const { action } = req.body;
  if (action === "inc") {
    await Counter.create();
  } else if (action === "clear") {
    await Counter.destroy({
      truncate: true,
    });
  }
  res.send({
    code: 0,
    data: await Counter.count(),
  });
});

// 获取计数
app.get("/api/count", async (req, res) => {
  const result = await Counter.count();
  res.send({
    code: 0,
    data: result,
  });
});

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

const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
