const express = require("express")
const cors = require("cors")
const bodyparser = require('body-parser')
const mysql=require('mysql2')
require("dotenv").config();
const path = require('path');
const app = express()
const jwt = require('jsonwebtoken');
const fs = require("fs");


const { a1l1q2 } = require("./A1L1RQ02.js");
const { a1l1q1 } = require("./A1L1RQ01.js");
const { a1l1q3 } = require('./A1L1RQ03.js');
const { calculateOverallScores } = require("./calculateOverallScores.js");
const axios = require("axios");
const { exec } = require('child_process');

app.use(bodyparser.json());
app.use(express.json())
app.use(bodyparser.json({limit: '50mb'}));
app.use(bodyparser.urlencoded({extended:true}));
app.use(express.static('public'));
const XLSX = require("xlsx");
const multer = require("multer");

const crypto = require('crypto');

// JWT config
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-prod';

const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS;

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verify error:', err);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

function basicAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Authorization header missing or not Basic' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [username, password] = decoded.split(':');

  if (
    username !== BASIC_AUTH_USER ||
    password !== BASIC_AUTH_PASS
  ) {
    return res.status(403).json({ error: 'Invalid username or password' });
  }

  // attach minimal identity if needed later
  req.authUser = username;
  next();
}

function generateOpaqueToken() {
  return crypto.randomBytes(24).toString('hex');
}


// Database Connection for dashboard'
app.use(cors({
  origin: ['http://localhost','http://localhost:5174','http://localhost:5194', 'http://localhost:3000','http://localhost:5184', 'http://127.0.0.1:3000', 'http://192.168.252.230:5173', "http://103.174.10.211:5173", process.env.ORIGIN], 
  methods: ['GET', 'POST'],
  credentials: true
}));

const con = mysql.createPool({
    host: process.env.DB_HOST,
    port: "3306",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

con.getConnection((error, connection) => {
    if (error) {
        console.error("Database connection failed:", error);
    } else {
        console.log("Database connected successfully for dashboard");
        connection.release(); // Release connection back to the pool
    }
});

// Startup migration: ensure single-tab enforcement columns exist
(async () => {
  const migrations = [
    "ALTER TABLE launch_tokens ADD COLUMN active_tab_id VARCHAR(64) DEFAULT NULL",
    "ALTER TABLE launch_tokens ADD COLUMN tab_heartbeat_at BIGINT UNSIGNED DEFAULT NULL"
  ];
  for (const sql of migrations) {
    try {
      await con.promise().query(sql);
    } catch (e) {
      if (!e.message.includes('Duplicate column name')) {
        console.warn('Migration warning:', e.message);
      }
    }
  }
  console.log('✅ Tab enforcement columns ready');
})();

module.exports = con;

// cron.schedule('*/3 * * * *', () => {
//   const sql = `UPDATE cocube_user SET log_status = 0 WHERE login_expiry < NOW() AND log_status = 1`;
//   con.query(sql, (err) => {
//     if (err) console.log("🔴 Cron cleanup failed:", err);
//     else console.log("🧹 Expired sessions cleaned up.");
//   });
// });

// ---------- Timer Session Logic ----------
const DURATION = 30 * 60 * 1000; // 30 mins
const EXAM_DURATION_MS = DURATION;
const DEADLINE_EPOCH_THRESHOLD_MS = 1000000000000;
const sessions = {}; // sessionId => { startedAt, remainingMs }

function isDeadlineStored(rawValue) {
  if (rawValue === null || rawValue === undefined) return false;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > DEADLINE_EPOCH_THRESHOLD_MS;
}

function getRemainingMsFromStoredValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return EXAM_DURATION_MS;

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return EXAM_DURATION_MS;

  if (isDeadlineStored(parsed)) {
    return Math.max(0, parsed - Date.now());
  }

  return Math.max(0, parsed);
}

function getDeadlineFromStoredValue(rawValue) {
  if (isDeadlineStored(rawValue)) {
    return Number(rawValue);
  }
  const remainingMs = getRemainingMsFromStoredValue(rawValue);
  return Date.now() + remainingMs;
}

async function insertUserLogSafe(userId, activityCode) {
  if (!userId) return;
  try {
    await con.promise().query(
      "INSERT INTO user_log (userid, activity_code) VALUES (?, ?)",
      [userId, activityCode]
    );
  } catch (err) {
    console.error(`Failed to insert user_log activity_code=${activityCode} for user=${userId}:`, err.message);
  }
}

async function runDockerCleanupForUser({ userId, question, framework }) {
  if (!userId || !question || !framework) {
    throw new Error("Missing userId, question, or framework for Docker cleanup");
  }

  const shScriptPath = path.join(__dirname, "cleanup-docker.sh");
  const psScriptPath = path.join(__dirname, "cleanup-docker.ps1");

  const command = process.platform === "win32"
    ? `powershell.exe -ExecutionPolicy Bypass -File "${psScriptPath}" "${question}" "${framework}" "${userId}"`
    : `bash "${shScriptPath}" "${question}" "${framework}" "${userId}"`;

  await new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      if (stderr) {
        console.warn(`Docker cleanup stderr for user ${userId}: ${stderr}`);
      }
      console.log(`✅ Docker cleanup output for user ${userId}:\n${stdout}`);
      resolve();
    });
  });

  await insertUserLogSafe(userId, 4);
  await insertUserLogSafe(userId, 5);
}

async function submitFinalAssessmentInternal({ aonId, framework, outputPort, userQuestion, message }) {
  if (!aonId || !framework || !userQuestion) {
    throw new Error("Missing required fields: aonId, framework, userQuestion");
  }

  const [latestTokenRows] = await con.promise().query(
    "SELECT submitted FROM launch_tokens WHERE aon_id = ? ORDER BY id DESC LIMIT 1",
    [aonId]
  );

  if (latestTokenRows.length > 0 && Number(latestTokenRows[0].submitted) === 1) {
    return {
      alreadySubmitted: true,
      detailedResults: null,
      redirectUrl: null,
    };
  }

  let results;

  if (userQuestion === "a1l1q3") {
    const { a1l1q3 } = require("./A1L1RQ03.js");
    results = await a1l1q3(aonId, framework, outputPort);
  } else if (userQuestion === "a1l1q2") {
    const { a1l1q2 } = require("./A1L1RQ02.js");
    results = await a1l1q2(aonId, framework, outputPort);
  } else if (userQuestion === "a1l1q1") {
    const { a1l1q1 } = require("./A1L1RQ01.js");
    results = await a1l1q1(aonId, framework, outputPort);
  } else {
    throw new Error("Invalid question type");
  }

  const overallResult = calculateOverallScores(results);
  const overallResultJson = JSON.stringify(overallResult);
  const resultJson = JSON.stringify(results);

  await con.promise().query(
    "INSERT INTO results (userid, result_data, overall_result) VALUES (?, ?, ?)",
    [aonId, resultJson, overallResultJson]
  );

  await con.promise().query(
    "UPDATE launch_tokens SET submitted = 1, log_status = 0, closing_time_ms = 0 WHERE aon_id = ?",
    [aonId]
  );

  let redirectUrl = null;
  try {
    const [redirectRows] = await con.promise().query(
      "SELECT redirect_url FROM external_requests WHERE aon_id = ? AND redirect_url IS NOT NULL ORDER BY id DESC LIMIT 1",
      [aonId]
    );
    if (redirectRows.length && redirectRows[0].redirect_url) {
      redirectUrl = redirectRows[0].redirect_url;
    }
  } catch (e) {
    console.error("Failed to fetch redirect_url for aonId", aonId, e.message);
  }

  const webhookPayload = {
    userId: aonId,
    result_data: results,
    overall_result: overallResult,
    timestamp: new Date().toISOString(),
    ...(message ? { message } : {}),
  };

  try {
    const [rows] = await con.promise().query(
      "SELECT results_webhook FROM external_requests WHERE aon_id = ? AND results_webhook IS NOT NULL ORDER BY id DESC LIMIT 1",
      [aonId]
    );

    if (rows.length && rows[0].results_webhook) {
      axios.post(
        rows[0].results_webhook,
        webhookPayload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Basic " + Buffer.from(`${process.env.BASIC_AUTH_USER}:${process.env.BASIC_AUTH_PASS}`).toString("base64"),
          },
          timeout: 5000,
        }
      )
      .then(() => {
        console.log("✅ Webhook delivered successfully for final submission");
      })
      .catch(err => {
        console.error("❌ Webhook failed:", err.message);
      });
    }
  } catch (e) {
    console.error("Failed to fetch/send results_webhook for aonId", aonId, e.message);
  }

  return {
    alreadySubmitted: false,
    detailedResults: results,
    redirectUrl,
  };
}

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage });


  app.post('/v2/start', (req, res) => {
    const { sessionId } = req.body;
    console.log("sessionId",sessionId)
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

    const session = sessions[sessionId];
    if (!session) {
      sessions[sessionId] = {
        startedAt: Date.now(),
        remainingMs: DURATION
      };
      return res.json({ message: 'Timer started' });
    }

    if (!session.startedAt && session.remainingMs > 0) {
      session.startedAt = Date.now();
      return res.json({ message: 'Timer resumed' });
    }

    return res.json({ message: 'Timer already running' });
  });

  app.post('/v2/pause/:userId/:sessionId/:timeLeft', (req, res) => {
    console.log("⏸️ Pause working");
  
    let sessionId;
    let timeLeft;
    let newTimeleft;
    try {
      // sessionId = typeof req.body === 'string'
      //   ? JSON.parse(req.body).sessionId
      //   : req.body.sessionId;
      sessionId = req.params.sessionId;
      timeLeft = req.params.timeLeft;
      newTimeleft = timeLeft*1000;
      console.log("timeleft",timeLeft)
      console.log("newTimeleft",newTimeleft)
      console.log("sessionId",sessionId)
      console.log(`⏸️ Paused session ${sessionId} with ${newTimeleft} ms left`);
  
    const userId = req.params.userId;
  
    // Store remainingMs into DB
    const updateQuery = `UPDATE cocube_user SET log_status=2, closing_time_ms = ? WHERE id = ?`;
    con.query(updateQuery, [newTimeleft, userId], (err, result) => {
      if (err) {
        console.error("❌ DB update failed:", err);
        return res.status(500).json({ error: 'Database update failed' });
      }
  
      console.log(`✅ Updated user ${userId} with closing_time_ms = ${newTimeleft}`);
      return res.json({ message: 'Paused and DB updated', remainingMs: newTimeleft });
    });

    var insertcategory="insert into user_log (userid,activity_code)values(?,?)"
      con.query(insertcategory,[userId , 6],(error,result)=>{
        if(error){
            console.log(error)
            // res.send({"status":"error"})

        }
        else{
          console.log("inserted")
          //  res.send({"status":"inserted"})
        }
      })
    } catch {
      return res.status(400).json({ error: 'Invalid pause data' });
    }
  
    // const session = sessions[sessionId];
    // if (!session || !session.startedAt) {
    //   return res.json({ message: 'No active timer' });
    // }
    // let newTimeleft = timeLeft*1000;
    // console.log("newTimeleft",newTimeleft)
    // const elapsed = Date.now() - session.startedAt;
    // session.remainingMs = Math.max(0, session.remainingMs - elapsed);
    // session.startedAt = null;
  
    
  });
  
  app.post('/v2/timer', (req, res) => {
    const { sessionId } = req.body;
    const session = sessions[sessionId];
    if (!session) return res.json({ remainingSeconds: 0, running: false });

    let remaining = session.remainingMs;
    if (session.startedAt) {
      const elapsed = Date.now() - session.startedAt;
      remaining = Math.max(0, session.remainingMs - elapsed);
    }

    if (remaining === 0) {
      session.startedAt = null;
      session.remainingMs = 0;
    }

    return res.json({
      remainingSeconds: Math.floor(remaining / 1000),
      running: !!session.startedAt
    });
  });

  // GET /user-log/:id
  app.get('/v2/time-left/:id', (req, res) => {
    const userId = req.params.id;
    console.log("userId triggered", userId);

    const sql = 'SELECT log_status, closing_time_ms FROM launch_tokens WHERE id = ?';

    con.query(sql, [userId], (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (result.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = result[0]; 
      const remainingMs = getRemainingMsFromStoredValue(user.closing_time_ms);
      const timerEndMs = isDeadlineStored(user.closing_time_ms)
        ? Number(user.closing_time_ms)
        : Date.now() + remainingMs;

      res.json({
        id: userId,
        log_status: user.log_status,
        closing_time_ms: remainingMs,
        timer_end_ms: timerEndMs
      });
    });
  });

    // Assuming Express is set up
  app.get('/v2/heartbeat', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Check if the candidate's dev server is reachable on the given outputPort
  app.post('/v2/check-dev-server', async (req, res) => {
    const { outputPort } = req.body;
    if (!outputPort) {
      return res.status(400).json({ running: false, error: 'outputPort is required' });
    }
    try {
      await axios.get(`http://localhost:${outputPort}`, { timeout: 3000 });
      res.json({ running: true });
    } catch (err) {
      // Any connection error means the server is not running
      res.json({ running: false });
    }
  });
  

  app.post("/v2/login",(req,res)=>{
   let{username,password}=req.body
      let loginsql='select * from cocube_user where emailid=?'
      con.query(loginsql,[username],(error,result)=>{
        if(error){
          res.send({"status":"empty_set"})
          console.log(error)
        }
        else if(result.length>0){
          let dbusername=result[0].emailid
          let dbpassword=result[0].password
          let id=result[0].id
          let role=result[0].role
          let name=result[0].name
          let question=result[0].assigned_question
          let docker_port=result[0].docker_port
          let output_port=result[0].output_port
          let empNo=result[0].employee_no
          let submitted =result[0].submitted
          if(dbusername===username && dbpassword===password){

            if (submitted === 1) {
              console.log("User already logged in ans submitted");
              return res.send({ "status": "already_logged_in" });
            }
            var insertcategory="insert into user_log (userid,activity_code)values(?,?)"
            con.query(insertcategory,[id , 1],(error,result)=>{
                if(error){
                    console.log(error)
                    // res.send({"status":"error"})

                }
                else{
                  console.log("inserted")
                  //  res.send({"status":"inserted"})
                }
            })
            
            const tokenPayload = { id, role, email: dbusername, name };
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '2h' });

            res.send({
              "status":"success",
              "id":id,
              "role":role,
              "name":name,
              "question":question,
              "docker_port":docker_port,
              "output_port":output_port,
              "empNo": empNo,
              "token": token
            })
            
            console.log("sucess",id,role, name)
          }
          else{
            res.send({"status":"invalid_user"})
            console.log("notmatch")
          }
        }
        else{
          res.send({"status":"both_are_invalid"})
          console.log("invaliald")
        }
      })
  })

   app.post("/v2/generate-token", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }

  const loginsql = 'SELECT * FROM cocube_user WHERE emailid = ?';

  con.query(loginsql, [username], (error, result) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Database error" });
    }

    if (!result || result.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const row = result[0];
    const { emailid, password: dbpassword, id, role, name } = row;

    // 🔐 Validate credentials
    if (emailid !== username || dbpassword !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 🚫 Role check — ONLY role === 1 allowed
    if (role !== 1) {
      return res.status(403).json({
        error: "Access denied. User not authorized to generate token"
      });
    }

    // 🪙 Generate JWT
    const tokenPayload = {
      id,
      role,
      email: emailid,
      name
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: "2h"
    });

    return res.json({ token });
  });
});

  app.post('/v2/run-Assesment', async (req, res) => {
    const { userId, framework, outputPort } = req.body;
    console.log(userId, framework)
    try {
      const results = await a1l1q3(userId,framework, outputPort);
      
      res.json({ detailedResults: results });

      const overallResult = calculateOverallScores(results);
      // console.log("Overall Result:", overallResult);      
    
      var insertcategory="insert into results (userid,result_data,overall_result) values(?,?,?)"
      const newOverallResult=JSON.stringify(overallResult)
      const newresult=JSON.stringify(results)
      con.query(insertcategory,[userId , newresult, newOverallResult],(error,result)=>{
          if(error){
              console.log(error)
              // res.send({"status":"error"})

          }
          else{
            console.log("inserted")
            //  res.send({"status":"inserted"})
          }
      var insertcategory2="insert into user_log (userid,activity_code)values(?,?)"
      con.query(insertcategory2,[userId , 3],(error,result)=>{
        if(error){
            console.log(error)
            // res.send({"status":"error"})

        }
        else{
          console.log("inserted")
          //  res.send({"status":"inserted"})
        }
      })
      })

    } catch (error) {
      console.error('Assessment error:', error);

      if (
        error.message?.includes('ERR_SOCKET_NOT_CONNECTED') ||
        error.message?.includes('localhost:5173')
      ) {
        var insertcategory="insert into user_log (userid,activity_code)values(?,?)"
        con.query(insertcategory,[userId , 3],(error,result)=>{
          if(error){
              console.log(error)
              // res.send({"status":"error"})

          }
          else{
            console.log("inserted")
            //  res.send({"status":"inserted"})
          }
        })
        return res.status(500).json({
          error: 'Frontend application is not running on port 5173. Please start it before running the assessment.'
        });
      }

      res.status(500).json({ error: 'Failed to run assessment', details: error.message });
    }
  });

  app.post('/v2/run-Assesment-2', async (req, res) => {
    const { userId, framework, outputPort } = req.body;
    console.log(userId, framework)
    try {
      const results = await a1l1q2(userId,framework, outputPort);
      res.json({ detailedResults: results });

      const overallResult = calculateOverallScores(results);

      var insertcategory="insert into results (userid,result_data,overall_result) values(?,?,?)"
      const newOverallResult=JSON.stringify(overallResult)
      const newresult=JSON.stringify(results)
      con.query(insertcategory,[userId , newresult, newOverallResult],(error,result)=>{
          if(error){
              console.log(error)
              // res.send({"status":"error"})

          }
          else{
            console.log("inserted")
            //  res.send({"status":"inserted"})
          }
      var insertcategory2="insert into user_log (userid,activity_code)values(?,?)"
      con.query(insertcategory2,[userId , 3],(error,result)=>{
        if(error){
            console.log(error)
            // res.send({"status":"error"})

        }
        else{
          console.log("inserted")
          //  res.send({"status":"inserted"})
        }
      })
      })
      

    } catch (error) {
      console.error('Assessment error:', error);

      if (
        error.message?.includes('ERR_SOCKET_NOT_CONNECTED') ||
        error.message?.includes('localhost:5173')
      ) {
        var insertcategory="insert into user_log (userid,activity_code)values(?,?)"
        con.query(insertcategory,[userId , 3],(error,result)=>{
          if(error){
              console.log(error)
              // res.send({"status":"error"})

          }
          else{
            console.log("inserted")
            //  res.send({"status":"inserted"})
          }
        })
        return res.status(500).json({
          error: 'Frontend application is not running on port 5173. Please start it before running the assessment.'
        });
      }

      res.status(500).json({ error: 'Failed to run assessment', details: error.message });
    }
  });

  app.post('/v2/run-Assesment-1', async (req, res) => {
    const { userId, framework, outputPort } = req.body;
    console.log(userId, framework)
    try {
      const results = await a1l1q1(userId,framework, outputPort);
      res.json({ detailedResults: results });
      
      const overallResult = calculateOverallScores(results);
      var insertcategory="insert into results (userid, result_data, overall_result) values(?,?,?)"
      const newOverallResult=JSON.stringify(overallResult)
      const newresult=JSON.stringify(results)
      con.query(insertcategory,[userId, newresult, newOverallResult],(error,result)=>{
          if(error){
              console.log(error)
              // res.send({"status":"error"})
          }
          else{
            console.log("inserted")
            //res.send({"status":"inserted"})
          }
      var insertcategory="insert into user_log (userid,activity_code)values(?,?)"
      con.query(insertcategory,[userId , 3],(error,result)=>{
        if(error){
            console.log(error)
            // res.send({"status":"error"})

        }
        else{
          console.log("inserted")
          //  res.send({"status":"inserted"})
        }
      })
      })
      

    } catch (error) {
      console.error('Assessment error:', error);

      if (
        error.message?.includes('ERR_SOCKET_NOT_CONNECTED') ||
        error.message?.includes('localhost:5173')
      ) {
        var insertcategory="insert into user_log (userid,activity_code)values(?,?)"
        con.query(insertcategory,[userId , 3],(error,result)=>{
          if(error){
              console.log(error)
              // res.send({"status":"error"})

          }
          else{
            console.log("inserted")
            //  res.send({"status":"inserted"})
          }
        })
        return res.status(500).json({
          error: 'Frontend application is not running on port 5173. Please start it before running the assessment.'
        });
      }

      res.status(500).json({ error: 'Failed to run assessment', details: error.message });
    }
  });

  app.post("/v2/run-script", (req, res) => {

    const { userId, empNo, userName, question, framework, dockerPort, outputPort } = req.body;

    // Detect OS
    const isWindows = process.platform === "win32";
    const extension = isWindows ? "ps1" : "sh";

    // Script path
    const scriptPath = path.join(
      __dirname,
      `generate-docker-compose-${question}-${framework}.${extension}`
    );

    // Build command
    const command = isWindows
      ? `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" -UserID ${userId} -EmployeeNo "${empNo}" -dockerPort ${dockerPort} -outputPort ${outputPort}`
      : `bash "${scriptPath}" "${userId}" "${empNo}" "${dockerPort}" "${outputPort}"`;

    console.log("🚀 Executing:", command);

    exec(command, (error, stdout, stderr) => {

      if (error) {
        console.error("❌ Script Execution Error:", error.message);
        return res.status(500).json({
          status: "error",
          message: "Script execution failed",
          error: error.message
        });
      }

      if (stderr) {
        console.warn("⚠️ Script stderr:", stderr);
      }

      console.log("✅ Script Output:\n", stdout);

      // Insert log
      const insertQuery =
        "INSERT INTO user_log (userid, activity_code) VALUES (?, ?)";

      con.query(insertQuery, [empNo, 2], (insertError) => {

        if (insertError) {
          console.error("🔴 DB Insert Error:", insertError);
          return res.status(500).json({
            status: "error",
            message: "Activity log insert failed"
          });
        }

        console.log("🟢 Activity log inserted");

        // Update user timestamps
        const updateQuery =
          "UPDATE cocube_user SET last_login = ?, login_expiry = ? WHERE id = ?";

        const issuedAt = new Date();
        const expiresAt = new Date(Date.now() + 40 * 60 * 1000);

        con.query(updateQuery, [issuedAt, expiresAt, userId], (updateError) => {

          if (updateError) {
            console.error("🔴 DB Update Error:", updateError);
            return res.status(500).json({
              status: "error",
              message: "User update failed"
            });
          }

          console.log("🟢 User timestamps updated");

          return res.status(200).json({
            status: "success",
            output: stdout,
            script: scriptPath
          });

        });

      });

    });

  });

  app.post('/v2/cleanup-docker', async (req, res) => {
    const { userId, question, framework } = req.body;

    if (!userId || !question || !framework) {
      return res.status(400).json({ error: 'userId, question, and framework are required' });
    }

    try {
      await runDockerCleanupForUser({ userId, question, framework });
      return res.json({ message: 'Docker environment cleaned up successfully.' });
    } catch (err) {
      console.error("Unexpected Error in Cleanup:", err);
      return res.status(500).json({ error: 'Failed to clean Docker.' });
    }
  });

  app.post('/v2/cleanup-docker-2', async (req, res) => {
    const { userId, question, framework } = req.body;
  
    // Validate userId
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
  
    try {
      if (question && framework) {
        await runDockerCleanupForUser({ userId, question, framework });
      } else {
        await insertUserLogSafe(userId, 4);
        await insertUserLogSafe(userId, 5);
      }

      return res.status(200).json({ status: 'success', message: 'Docker cleanup completed' });
    } catch (err) {
      console.error('Failed to clean Docker:', err);
      return res.status(500).json({ error: 'Failed to clean Docker.' });
    }
  });

  app.get('/v2/results', basicAuth, (req, res) => {


    const sql = 'SELECT * FROM results ORDER BY result_time DESC';
    con.query(sql, (err, result) => {
        if (err) {
            console.error('Error fetching question:', err);
            return res.status(500).json({ error: 'Database query error' });
        }
        if (result.length === 0) {
            return res.status(404).json({ message: 'Question not found' });
        }
        res.json({ results: result });
    });
  
  
  });
  
  app.get('/v2/results/:id', basicAuth, (req, res) => {
  
      const id = req.params.id; // Get the ID from the request parameters
  
      const sql = 'SELECT * FROM results WHERE userid = ? ORDER BY result_time DESC';
      con.query(sql, [id], (err, result) => {
          if (err) {
              console.error('Error fetching question:', err);
              return res.status(500).json({ error: 'Database query error' });
          }
          if (result.length === 0) {
              return res.status(404).json({ message: 'Question not found' });
          }
          res.json({ results: result });
      });
    
  
  });

  app.post('/v2/logout', async (req, res) => {
    const { userId } = req.body;

    // Validate userId
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    try {
      // Insert second log entry (activity_code: 5)
      const insertCategory2 = 'INSERT INTO user_log (userid, activity_code) VALUES (?, ?)';
      con.query(insertCategory2, [userId, 5],(error,result)=>{
        if(error){
            console.log(error)
            // res.send({"status":"error"})

        }
        else{
          console.log('Inserted log with activity_code 5');
          //  res.send({"status":"inserted"})
        }
      });

      // var updateQuery = 'UPDATE cocube_user SET log_status = 0 WHERE id = ?';
      // con.query(updateQuery,[userId],(error,result)=>{
      //   if(error){
      //       console.log(error)
      //       // res.send({"status":"error"})

      //   }
      //   else{
      //     console.log("updated")
      //     //  res.send({"status":"inserted"})
      //   }
      // });
      
      // Send success response
      res.status(200).json({ status: 'success', message: 'logged out' });
    } catch (err) {
      console.error('Failed to logout:', err);
      res.status(500).json({ error: 'Failed to logout' });
    }
  });
  
  app.post('/v2/candidate', async (req, res) => {
    const { userId, name, employeeNo } = req.body;
  
    if (!userId || !name || !employeeNo) {
      return res.status(400).json({ error: 'All fields are required' });
    }
  
    try {
      // Check if userId or employeeNo already exists
      const checkQuery = 'SELECT * FROM userreference WHERE employeeNo = ?';
      const [existingUsers] = await con.promise().query(checkQuery, [employeeNo]);
  
      if (existingUsers.length > 0) {
        return res.status(409).json({ error: 'User with this ID or Employee Number already exists' });
      }
  
      // Insert new user if no duplicates found
      const insertQuery = 'INSERT INTO userreference (userId, name, employeeNo) VALUES (?, ?, ?)';
      const [result] = await con.promise().query(insertQuery, [userId, name, employeeNo]);

      var updateQuery = 'UPDATE cocube_user SET log_status = 1 WHERE id = ?';
          con.query(updateQuery,[id],(error,result)=>{
            if(error){
                console.log(error)
                // res.send({"status":"error"})

            }
            else{
              console.log("updated")
              //  res.send({"status":"inserted"})
            }
        })
  
      res.status(201).json({ message: 'Candidate data saved successfully', id: result.insertId });
    } catch (err) {
      console.error('Error saving candidate data:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });


//Test Module Admin

// Add test
app.post("/v2/tests", (req, res) => {
  const { test_name, description, duration, date, start_time, end_time, status } = req.body;

  const sql = `
    INSERT INTO tests (test_name, description, duration, date, start_time, end_time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  con.query(
    sql,
    [test_name, description, duration, date, start_time, end_time, status || "Active"],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error inserting test");
      }
      res.status(200).send({ message: "Test created successfully", id: result.insertId });
    }
  );
});

// Get test details
  app.get("/v2/test-details", (req, res) => {
  const sql = `
    SELECT 
      t.id AS test_id,
      t.test_name AS testName,
      COUNT(tau.aon_id) AS assigned, 
      COALESCE(SUM(CASE WHEN tau.status = 'Used' THEN 1 ELSE 0 END), 0) AS used,
      COALESCE(SUM(CASE WHEN tau.status = 'Assigned' THEN 1 ELSE 0 END), 0) AS unused,
      t.status
    FROM tests t
    LEFT JOIN test_assignment_users tau ON t.id = tau.test_id
    GROUP BY t.id, t.test_name, t.status;
  `;

  con.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Error fetching test details:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

const uploaduser = multer({ dest: "uploads/" });


app.post("/v2/assign-users", uploaduser.single("file"), (req, res) => {
  const { testId } = req.body;
  if (!testId || !req.file) {
    return res.status(400).json({ message: "test_id and Excel file are required" });
  }

  const XLSX = require("xlsx");
  const workbook = XLSX.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const aon_ids = rows.slice(1).map(r => r[0]).filter(Boolean);
  if (aon_ids.length === 0) {
    return res.status(400).json({ message: "No AON IDs found in Excel file" });
  }

  // Step 1: Get remaining license
  con.query(
    "SELECT remaining_license FROM license_track ORDER BY id DESC LIMIT 1",
    (err, licenseResult) => {
      if (err) return res.status(500).json({ message: "Database error" });

      const availableLicense = licenseResult.length > 0 ? licenseResult[0].remaining_license : 0;
      const overdue = aon_ids.length > availableLicense ? aon_ids.length - availableLicense : 0;

      // Step 2: Check duplicates across ALL tests
      con.query(
        `SELECT tau.aon_id, t.test_name, t.id AS test_id
         FROM test_assignment_users tau 
         JOIN tests t ON tau.test_id = t.id
         WHERE tau.aon_id IN (?)`,
        [aon_ids],
        (err, existingRows) => {
          if (err) return res.status(500).json({ message: "Database error" });

          const duplicates = existingRows.map(row => ({
            aon_id: row.aon_id,
            test_name: row.test_name,
            test_link: `http://localhost:5001/api/${row.test_id}/${row.aon_id}`
          }));

          const existingIds = duplicates.map(d => d.aon_id);
          const newIds = aon_ids.filter(id => !existingIds.includes(id));

          if (newIds.length === 0) {
            return res.status(200).json({
              message: "No new users to assign (all duplicates across tests)",
              skipped: duplicates
            });
          }

          // Step 3: Insert new IDs
          const values = newIds.map(aon_id => [testId, aon_id, "Assigned"]);
          con.query(
            "INSERT INTO test_assignment_users (test_id, aon_id, status) VALUES ?",
            [values],
            (err, result) => {
              if (err) return res.status(500).json({ message: "Database insert error" });

              con.query("SELECT test_name FROM tests WHERE id = ?", [testId], async (err3, testRes) => {
                if (err3 || testRes.length === 0) {
                  return res.status(500).json({ message: "Failed to fetch test name" });
                }

                const testName = testRes[0].test_name;

                // Build inserted user JSON
                const newUsers = newIds.map(aon_id => ({
                  aon_id,
                  test_name: testName,
                  test_id:testId,
                  test_link: `http://localhost:5001/api/${testId}/${aon_id}`
                }));

                // Step 4: Update license
                con.query(
                  `UPDATE license_track 
                   SET remaining_license = remaining_license - ? 
                   WHERE id = (SELECT id FROM (SELECT id FROM license_track ORDER BY id DESC LIMIT 1) t)`,
                  [newIds.length],
                  async (err2) => {
                    if (err2) return res.status(500).json({ message: "License update failed" });

                    // 🔹 Log JSON in backend
                    console.log("Inserted Users JSON:", JSON.stringify(newUsers, null, 2));

                    // 🔹 Forward JSON to another API
                    try {
                      const forwardRes = await axios.post("http://192.168.252.254:3000/api/app/kggeniuslabs_registration", newUsers);
                      console.log("Forwarded successfully:", forwardRes.data);
                    } catch (fwdErr) {
                      console.error("Error forwarding JSON:", fwdErr.message);
                    }

                    res.json({
                      message: `✅ ${result.affectedRows} users assigned, ❌ ${duplicates.length} skipped${overdue > 0 ? `, ⚠️ Overdue by ${overdue} licenses` : ""}`,
                      inserted: newUsers,
                      skipped: duplicates,
                      overdue
                    });
                  }
                );
              });
            }
          );
        }
      );
    }
  );
});

// External API: accept payload from other server and assign a random test
app.post('/v2/external/assign',basicAuth, async (req, res) => {
  const payload = req.body || {};
    const { session_id, aon_id, redirect_url, results_webhook, user_metadata, client_id } = payload;

    if (!session_id || !aon_id) {
      return res.status(400).json({ error: 'Missing required fields: session_id or aon_id' });
    }

    // CHECK: Reject if aon_id already has ANY launch token (submitted OR still active).
    // This prevents re-assignment after expiry and after submission.
    try {
      const [existingTokens] = await con.promise().query(
        `SELECT lt.token, lt.expires_at, lt.submitted,
                (SELECT tau.test_link FROM test_assignment_users tau 
                 WHERE tau.aon_id COLLATE utf8mb4_general_ci = lt.aon_id COLLATE utf8mb4_general_ci
                 AND tau.session_id COLLATE utf8mb4_general_ci = lt.session_id COLLATE utf8mb4_general_ci
                 LIMIT 1) AS test_link
         FROM launch_tokens lt
         WHERE lt.aon_id COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci
         ORDER BY lt.id DESC LIMIT 1`,
        [aon_id]
      );

      if (existingTokens.length > 0) {
        const token = existingTokens[0];
        if (Number(token.submitted) === 1) {
          return res.status(409).json({
            error: 'Assessment already submitted for this aon_id',
            message: 'This candidate has already completed and submitted the assessment.',
            existing_link: token.test_link || null
          });
        }
        // Token exists and not submitted — still active or expired-but-pending
        return res.status(409).json({ 
          error: 'Test link already assigned for this aon_id',
          message: 'A test link has already been generated for this candidate. Each aon_id can only have one active test link.',
          existing_link: token.test_link || null
        });
      }
    } catch (e) {
      console.warn('Check for existing token failed:', e.message);
      // Continue with assignment if check fails (fail-open behavior)
    }

    // log request (non-blocking)
    try {
      await con.promise().query(
        `INSERT INTO external_requests 
        (session_id, aon_id, redirect_url, results_webhook, user_metadata)
        VALUES (?, ?, ?, ?, ?)`,
        [
          session_id,
          aon_id,
          redirect_url || null,
          results_webhook || null,
          JSON.stringify(user_metadata || {})
        ]
      );
    } catch (e) {
      console.warn('external_requests insert failed:', e.message);
    }

    let connection;

    try {
      // 🔑 GET SINGLE CONNECTION
      connection = await con.promise().getConnection();
      await connection.beginTransaction();

      // 1️⃣ pick random active test
      const [tests] = await connection.query(
        `SELECT id, test_name
        FROM tests
        WHERE status = 'Active'
        ORDER BY RAND()
        LIMIT 1`
      );

      if (!tests.length) {
        throw new Error('No active tests available');
      }

      const test = tests[0];

     // 2️⃣ Build slot query based on whether client_id is provided
      let slotQuery;
      let slotParams = [];

      if (client_id) {
        // If client_id is provided, get slots assigned to this client
        // First, verify the client exists
        const [clientCheck] = await connection.query(
          `SELECT client_id, client_name FROM clients WHERE client_id = ? OR client_code = ?`,
          [client_id, client_id]
        );

        if (!clientCheck.length) {
          throw new Error(`Client not found: ${client_id}`);
        }

        const resolvedClientId = clientCheck[0].client_id;
        console.log(`Using client: ${clientCheck[0].client_name} (ID: ${resolvedClientId})`);

        // Get slots assigned to this client that are not utilized
        slotQuery = `
          SELECT cps.id, cps.question_id, cps.docker_port, cps.frontend_port
          FROM candidate_port_slots cps
          INNER JOIN client_assignments ca ON ca.slot_id = cps.id AND ca.is_active = 1
          WHERE cps.is_utilized = 0 AND ca.client_id = ?
          ORDER BY RAND()
          LIMIT 1
          FOR UPDATE
        `;
        slotParams = [resolvedClientId];
      } else {
        // No client_id provided - use any available slot (backward compatibility)
        slotQuery = `
          SELECT id, question_id, docker_port, frontend_port
          FROM candidate_port_slots
          WHERE is_utilized = 0
          ORDER BY RAND()
          LIMIT 1
          FOR UPDATE
        `;
      }

      const [slots] = await connection.query(slotQuery, slotParams);

      if (!slots.length) {
        const errorMsg = client_id 
          ? `No free slots available for client: ${client_id}. Please ensure slots are assigned to this client.`
          : 'No free slots available';
        throw new Error(errorMsg);
      }

      const slot = slots[0];

      const launchToken = generateOpaqueToken();

      // 3️⃣ insert launch token
      await connection.query(
        `INSERT INTO launch_tokens
        (token, session_id, aon_id, test_id, slot_id, expires_at)
        VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 3 HOUR))`,
        [launchToken, session_id, aon_id, test.id, slot.id]
      );

      // 4️⃣ mark slot as utilized
      await connection.query(
        `UPDATE candidate_port_slots
        SET is_utilized = 1
        WHERE id = ?`,
        [slot.id]
      );

      // 5️⃣ commit transaction
      await connection.commit();

      const test_link = `${process.env.TEST_LINK}/aon/start?t=${launchToken}`;

      // non-transactional insert (safe after commit)
      await con.promise().query(
        `INSERT INTO test_assignment_users
        (test_id, aon_id, status, session_id, test_link)
        VALUES (?, ?, ?, ?, ?)`,
        [test.id, aon_id, 'Assigned', session_id, test_link]
      );

      return res.json({
        aon_id,
        session_id,
        test_id: test.id,
        test_name: test.test_name,
        test_link,
        test_link,
        client_id: client_id || null
      });

    } catch (err) {
      if (connection) await connection.rollback();
      console.error('External assign error:', err);
      return res.status(500).json({
        error: 'Failed to assign test',
        details: err.message
      });
    } finally {
      if (connection) connection.release();
    }
});

app.get("/v2/aon/resolve", async (req, res) => {
   const { t } = req.query;

    if (!t) {
      return res.status(400).json({ success: false, error: "Missing token" });
    }

    const [rows] = await con.promise().query(
      `
      SELECT
        lt.id,
        lt.session_id,
        lt.aon_id,
        lt.test_id,
        lt.log_status,
        lt.closing_time_ms,
        lt.assessment_started,
        lt.workspace_url,
        lt.framework,
        lt.submitted,
        t.test_name,

        cps.question_id,
        cps.docker_port,
        cps.frontend_port AS output_port,

        (SELECT er.redirect_url
         FROM external_requests er
         WHERE er.aon_id = lt.aon_id
           AND er.redirect_url IS NOT NULL
         ORDER BY er.id DESC
         LIMIT 1) AS redirect_url

      FROM launch_tokens lt
      INNER JOIN tests t
        ON t.id = lt.test_id
      INNER JOIN candidate_port_slots cps
        ON cps.id = lt.slot_id

      WHERE lt.token = ?
      `,
      [t]
    );

    if (!rows.length) {
      return res.json({ success: false, message: 'Token not found' });
    }

    // // optional: one-time-use token (recommended)
    // await con.promise().query(
    //   `DELETE FROM launch_tokens WHERE token = ?`,
    //   [t]
    // );

    return res.json({
      success: true,
      payload: rows[0]
    });
  });

    // Track when user starts the workspace/assessment
  app.post("/v2/aon/start-workspace", async (req, res) => {
    const { launchTokenId, workspaceUrl, framework } = req.body;

    if (!launchTokenId) {
      return res.status(400).json({ success: false, error: "Missing launchTokenId" });
    }

    try {
      const [rows] = await con.promise().query(
        `SELECT closing_time_ms FROM launch_tokens WHERE id = ? LIMIT 1`,
        [launchTokenId]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, error: "Invalid launchTokenId" });
      }

      const deadlineMs = getDeadlineFromStoredValue(rows[0].closing_time_ms);

      await con.promise().query(
        `UPDATE launch_tokens 
         SET assessment_started = 1, 
             workspace_url = ?, 
             framework = ?,
             log_status = 1,
             closing_time_ms = ?
         WHERE id = ?`,
        [workspaceUrl || null, framework || null, deadlineMs, launchTokenId]
      );

      return res.json({ success: true, message: "Workspace started tracking updated" });
    } catch (err) {
      console.error("Error updating workspace start:", err);
      return res.status(500).json({ success: false, error: "Database update failed" });
    }
  });

  // Pause timer and save remaining time for launch token
  app.post('/v2/aon/pause-timer/:launchTokenId/:timeLeft', (req, res) => {
    const { launchTokenId } = req.params;

    con.query(
      `SELECT closing_time_ms FROM launch_tokens WHERE id = ? LIMIT 1`,
      [launchTokenId],
      (err, rows) => {
        if (err) {
          console.error("❌ DB read failed:", err);
          return res.status(500).json({ error: 'Database read failed' });
        }

        if (!rows.length) {
          return res.status(404).json({ error: 'Launch token not found' });
        }

        const deadlineMs = getDeadlineFromStoredValue(rows[0].closing_time_ms);
        const remainingMs = Math.max(0, deadlineMs - Date.now());

        con.query(
          `UPDATE launch_tokens SET log_status = 1, closing_time_ms = ? WHERE id = ?`,
          [deadlineMs, launchTokenId],
          (updateErr) => {
            if (updateErr) {
              console.error("❌ DB update failed:", updateErr);
              return res.status(500).json({ error: 'Database update failed' });
            }

            return res.json({
              message: 'Timer continues in background; no pause applied',
              remainingMs,
            });
          }
        );
      }
    );
  });

  // Submit final assessment and send webhook
  app.post('/v2/submit-final', async (req, res) => {
    console.log('🚀 Received final submission');
    const { aonId, framework, outputPort, userQuestion, autoSubmit, reason } = req.body;

    if (!aonId || !framework || !userQuestion) {
      return res.status(400).json({ error: 'Missing required fields: aonId, framework, userQuestion' });
    }

    // Build a precise message for the webhook based on the trigger reason
    let autoSubmitMessage;
    if (autoSubmit) {
      switch (reason) {
        case 'tab_switch':
          autoSubmitMessage = 'The candidate was auto-submitted due to repeated tab switching (assessment integrity violation). Development server was running at the time of submission.';
          break;
        case 'timer_expired':
        default:
          autoSubmitMessage = 'The candidate exceeded the allotted time and the assessment was submitted automatically. Development server was running at the time of submission.';
      }
    }

    try {
      const submission = await submitFinalAssessmentInternal({
        aonId,
        framework,
        outputPort,
        userQuestion,
        message: autoSubmitMessage,
      });

      return res.json({
        success: true, 
        message: submission.alreadySubmitted ? 'Assessment already submitted' : 'Assessment submitted successfully',
        detailedResults: submission.detailedResults,
        redirect_url: submission.redirectUrl 
      });

    } catch (error) {
      console.error('Final submission error:', error);

      // Check if the error is because dev server is not running
      const isDevServerDown = error.message && (
        error.message.includes('ERR_EMPTY_RESPONSE') ||
        error.message.includes('ERR_CONNECTION_REFUSED') ||
        error.message.includes('ERR_SOCKET_NOT_CONNECTED') ||
        error.message.includes('localhost:5173') ||
        error.message.includes('net::ERR_')
      );

      if (isDevServerDown) {
        return res.status(200).json({
          success: false,
          devServerNotRunning: true,
          message: 'Development server is not running. Please follow the guidelines to start your application before submitting.'
        });
      }

      return res.status(500).json({ error: 'Failed to submit assessment', details: error.message });
    }
  });

   // ========== CLIENT MANAGEMENT API ENDPOINTS ==========

  // Get all clients
  app.get('/v2/clients', async (req, res) => {
    try {
      const [clients] = await con.promise().query(
        'SELECT * FROM clients ORDER BY client_name'
      );
      res.json(clients);
    } catch (err) {
      console.error('Error fetching clients:', err);
      res.status(500).json({ error: 'Failed to fetch clients' });
    }
  });

  // Add a new client
  app.post('/v2/clients', async (req, res) => {
    const { client_name, client_code, description } = req.body;

    if (!client_name || !client_code) {
      return res.status(400).json({ error: 'client_name and client_code are required' });
    }

    try {
      const [existing] = await con.promise().query(
        'SELECT client_id FROM clients WHERE client_code = ?',
        [client_code]
      );

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Client code already exists' });
      }

      const [result] = await con.promise().query(
        'INSERT INTO clients (client_name, client_code, description) VALUES (?, ?, ?)',
        [client_name, client_code, description || null]
      );

      res.status(201).json({
        message: 'Client created successfully',
        client_id: result.insertId
      });
    } catch (err) {
      console.error('Error creating client:', err);
      res.status(500).json({ error: 'Failed to create client' });
    }
  });

  // Delete a client
  app.delete('/v2/clients/:id', async (req, res) => {
    const clientId = req.params.id;

    try {
      // First, delete all assignments for this client
      await con.promise().query(
        'DELETE FROM client_assignments WHERE client_id = ?',
        [clientId]
      );

      // Then delete the client
      const [result] = await con.promise().query(
        'DELETE FROM clients WHERE client_id = ?',
        [clientId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }

      res.json({ message: 'Client deleted successfully' });
    } catch (err) {
      console.error('Error deleting client:', err);
      res.status(500).json({ error: 'Failed to delete client' });
    }
  });

  // Get all slots
  app.get('/v2/slots', async (req, res) => {
    try {
      const [slots] = await con.promise().query(
        'SELECT * FROM candidate_port_slots ORDER BY id'
      );
      res.json(slots);
    } catch (err) {
      console.error('Error fetching slots:', err);
      res.status(500).json({ error: 'Failed to fetch slots' });
    }
  });

  // Get all client assignments
  app.get('/v2/client-assignments', async (req, res) => {
    try {
      const [assignments] = await con.promise().query(
        `SELECT ca.*, c.client_name, cps.question_id, cps.docker_port, cps.frontend_port
         FROM client_assignments ca
         INNER JOIN clients c ON c.client_id = ca.client_id
         INNER JOIN candidate_port_slots cps ON cps.id = ca.slot_id
         WHERE ca.is_active = 1`
      );
      res.json(assignments);
    } catch (err) {
      console.error('Error fetching client assignments:', err);
      res.status(500).json({ error: 'Failed to fetch client assignments' });
    }
  });

  // Assign slots to a client
  app.post('/v2/client-assignments', async (req, res) => {
    const { client_id, slot_ids } = req.body;

    if (!client_id || !Array.isArray(slot_ids)) {
      return res.status(400).json({ error: 'client_id and slot_ids array are required' });
    }

    let connection;
    try {
      connection = await con.promise().getConnection();
      await connection.beginTransaction();

      // First, remove all existing assignments for this client
      await connection.query(
        'DELETE FROM client_assignments WHERE client_id = ?',
        [client_id]
      );

      // Then insert new assignments
      if (slot_ids.length > 0) {
        const values = slot_ids.map(slotId => [client_id, slotId]);
        await connection.query(
          'INSERT INTO client_assignments (client_id, slot_id) VALUES ?',
          [values]
        );
      }

      await connection.commit();
      res.json({ message: 'Slots assigned successfully', assigned_count: slot_ids.length });
    } catch (err) {
      if (connection) await connection.rollback();
      console.error('Error assigning slots:', err);
      res.status(500).json({ error: 'Failed to assign slots' });
    } finally {
      if (connection) connection.release();
    }
  });

   app.post('/v2/slots/reset', async (req, res) => {
    try {
      await con.promise().query(
        'UPDATE candidate_port_slots SET is_utilized = 0'
      );
      res.json({ message: 'All slot utilizations reset to 0' });
    } catch (err) {
      console.error('Error resetting slots:', err);
      res.status(500).json({ error: 'Failed to reset slots' });
    }
  });

  // Submit when candidate did NOT run the assessment (timer expired without dev server)
  app.post('/v2/submit-no-assessment', async (req, res) => {
    const { aonId, message } = req.body;

    if (!aonId) {
      return res.status(400).json({ error: 'Missing required field: aonId' });
    }

    try {
      // Check if already submitted
      const [latestTokenRows] = await con.promise().query(
        "SELECT submitted FROM launch_tokens WHERE aon_id = ? ORDER BY id DESC LIMIT 1",
        [aonId]
      );

      if (latestTokenRows.length > 0 && Number(latestTokenRows[0].submitted) === 1) {
        return res.json({ success: true, message: 'Assessment already submitted' });
      }

      // Mark as submitted
      await con.promise().query(
        "UPDATE launch_tokens SET submitted = 1, log_status = 0, closing_time_ms = 0 WHERE aon_id = ?",
        [aonId]
      );

      // Get redirect URL
      let redirectUrl = null;
      try {
        const [redirectRows] = await con.promise().query(
          "SELECT redirect_url FROM external_requests WHERE aon_id = ? AND redirect_url IS NOT NULL ORDER BY id DESC LIMIT 1",
          [aonId]
        );
        if (redirectRows.length && redirectRows[0].redirect_url) {
          redirectUrl = redirectRows[0].redirect_url;
        }
      } catch (e) {
        console.error("Failed to fetch redirect_url for aonId", aonId, e.message);
      }

      // Send webhook with message only (no results)
      const webhookPayload = {
        userId: aonId,
        result_data: null,
        overall_result: null,
        message: message || "The timer has run out also candidate do not attempted the test by following the guidelines",
        timestamp: new Date().toISOString(),
      };

      try {
        const [rows] = await con.promise().query(
          "SELECT results_webhook FROM external_requests WHERE aon_id = ? AND results_webhook IS NOT NULL ORDER BY id DESC LIMIT 1",
          [aonId]
        );

        if (rows.length && rows[0].results_webhook) {
          axios.post(
            rows[0].results_webhook,
            webhookPayload,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: "Basic " + Buffer.from(`${process.env.BASIC_AUTH_USER}:${process.env.BASIC_AUTH_PASS}`).toString("base64"),
              },
              timeout: 5000,
            }
          )
          .then(() => console.log("✅ No-assessment webhook delivered for", aonId))
          .catch(err => console.error("❌ No-assessment webhook failed:", err.message));
        }
      } catch (e) {
        console.error("Failed to send no-assessment webhook for aonId", aonId, e.message);
      }

      return res.json({
        success: true,
        message: 'Submitted without assessment',
        redirect_url: redirectUrl,
      });

    } catch (error) {
      console.error('Submit-no-assessment error:', error);
      return res.status(500).json({ error: 'Failed to submit', details: error.message });
    }
  });

  // ---------- CRON JOB: Clean up stale sessions every 30 minutes ----------
  const cron = require('node-cron');

  async function sendWebhookForUser(aonId, payload) {
    try {
      const [rows] = await con.promise().query(
        "SELECT results_webhook FROM external_requests WHERE aon_id = ? AND results_webhook IS NOT NULL ORDER BY id DESC LIMIT 1",
        [aonId]
      );
      if (rows.length && rows[0].results_webhook) {
        await axios.post(
          rows[0].results_webhook,
          payload,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: "Basic " + Buffer.from(`${process.env.BASIC_AUTH_USER}:${process.env.BASIC_AUTH_PASS}`).toString("base64"),
            },
            timeout: 10000,
          }
        );
        console.log(`✅ Cron webhook delivered for ${aonId}`);
      }
    } catch (e) {
      console.error(`❌ Cron webhook failed for ${aonId}:`, e.message);
    }
  }

  async function getRedirectUrl(aonId) {
    try {
      const [redirectRows] = await con.promise().query(
        "SELECT redirect_url FROM external_requests WHERE aon_id = ? AND redirect_url IS NOT NULL ORDER BY id DESC LIMIT 1",
        [aonId]
      );
      if (redirectRows.length && redirectRows[0].redirect_url) {
        return redirectRows[0].redirect_url;
      }
    } catch (e) {
      console.error("Failed to fetch redirect_url for aonId", aonId, e.message);
    }
    return null;
  }

  cron.schedule('*/30 * * * *', async () => {
    console.log('🔄 [CRON] Running stale session cleanup...');

    try {
      // Find all launch_tokens where:
      // - submitted = 0 (not yet submitted)
      // - assessment_started = 1 (user opened the workspace)
      // - closing_time_ms is a deadline that has passed (timer expired)
      // - OR expires_at has passed
      const [staleSessions] = await con.promise().query(
        `SELECT lt.id, lt.aon_id, lt.closing_time_ms, lt.framework, lt.workspace_url,
                cps.question_id, cps.docker_port, cps.frontend_port
         FROM launch_tokens lt
         INNER JOIN candidate_port_slots cps ON cps.id = lt.slot_id
         WHERE lt.submitted = 0
           AND lt.log_status != 0
           AND (
             (lt.closing_time_ms IS NOT NULL AND lt.closing_time_ms > 1000000000000 AND lt.closing_time_ms < ?)
             OR lt.expires_at < NOW()
           )`,
        [Date.now()]
      );

      if (staleSessions.length === 0) {
        console.log('🧹 [CRON] No stale sessions found.');
        return;
      }

      console.log(`🧹 [CRON] Found ${staleSessions.length} stale session(s) to clean up.`);

      for (const session of staleSessions) {
        const { id, aon_id, framework, workspace_url, question_id, docker_port, frontend_port } = session;
        console.log(`🔧 [CRON] Processing stale session for ${aon_id} (token id: ${id})`);

        try {
          // Check if user ran the dev server by trying the assessment
          let results = null;
          let message = '';
          let assessmentRan = false;

          if (workspace_url && framework && question_id) {
            // User started the workspace - try to run assessment
            try {
              if (question_id === 'a1l1q1') {
                results = await a1l1q1(aon_id, framework, frontend_port);
              } else if (question_id === 'a1l1q2') {
                results = await a1l1q2(aon_id, framework, frontend_port);
              } else if (question_id === 'a1l1q3') {
                results = await a1l1q3(aon_id, framework, frontend_port);
              }
              assessmentRan = true;
              message = "the user exceeded the time so submitted automatically";
            } catch (assessErr) {
              // Dev server not running - user didn't run the application
              console.log(`[CRON] Assessment failed for ${aon_id} (dev server likely not running): ${assessErr.message}`);
              message = "The timer has run out also candidate do not attempted the test by following the guidelines";
            }
          } else {
            // User didn't even start the workspace properly
            message = "The timer has run out also candidate do not attempted the test by following the guidelines";
          }

          // Save results if assessment ran
          if (assessmentRan && results) {
            const overallResult = calculateOverallScores(results);
            await con.promise().query(
              "INSERT INTO results (userid, result_data, overall_result) VALUES (?, ?, ?)",
              [aon_id, JSON.stringify(results), JSON.stringify(overallResult)]
            );
          }

          // Mark as submitted
          await con.promise().query(
            "UPDATE launch_tokens SET submitted = 1, log_status = 0, closing_time_ms = 0 WHERE id = ?",
            [id]
          );

          // Send webhook
          const webhookPayload = {
            userId: aon_id,
            result_data: results,
            overall_result: results ? calculateOverallScores(results) : null,
            message: message,
            timestamp: new Date().toISOString(),
          };
          await sendWebhookForUser(aon_id, webhookPayload);

          // Insert activity logs
          await insertUserLogSafe(aon_id, 4); // docker cleanup
          await insertUserLogSafe(aon_id, 5); // logout

          // Clean up Docker if we have the info
          if (question_id && framework) {
            try {
              await runDockerCleanupForUser({ userId: aon_id, question: question_id, framework });
              console.log(`✅ [CRON] Docker cleaned up for ${aon_id}`);
            } catch (dockerErr) {
              console.error(`❌ [CRON] Docker cleanup failed for ${aon_id}:`, dockerErr.message);
            }
          }

          // Release the slot
          try {
            const [slotRows] = await con.promise().query(
              "SELECT slot_id FROM launch_tokens WHERE id = ?",
              [id]
            );
            if (slotRows.length) {
              await con.promise().query(
                "UPDATE candidate_port_slots SET is_utilized = 0 WHERE id = ?",
                [slotRows[0].slot_id]
              );
              console.log(`✅ [CRON] Slot released for ${aon_id}`);
            }
          } catch (slotErr) {
            console.error(`❌ [CRON] Slot release failed for ${aon_id}:`, slotErr.message);
          }

          console.log(`✅ [CRON] Stale session cleaned up for ${aon_id}`);

        } catch (sessionErr) {
          console.error(`❌ [CRON] Failed to process session for ${aon_id}:`, sessionErr.message);
        }
      }

      console.log('🔄 [CRON] Stale session cleanup completed.');
    } catch (err) {
      console.error('❌ [CRON] Stale session cleanup failed:', err.message);
    }
  });

// ========== SINGLE TAB ENFORCEMENT ==========
// A candidate's test link may only be active in one browser tab at a time.
// Tabs send a heartbeat every 10s; a tab is considered closed after 25s of silence.

const TAB_HEARTBEAT_TIMEOUT_MS = 60000; // 60 s — beacon releases instantly on real close

// Claim the active-tab slot for a launch token
app.post('/v2/aon/claim-tab', async (req, res) => {
  const { launchTokenId, tabId } = req.body;
  if (!launchTokenId || !tabId) {
    return res.status(400).json({ error: 'launchTokenId and tabId are required' });
  }
  try {
    const [rows] = await con.promise().query(
      `SELECT submitted, active_tab_id, tab_heartbeat_at FROM launch_tokens WHERE id = ? LIMIT 1`,
      [launchTokenId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Launch token not found' });
    }
    const row = rows[0];
    if (Number(row.submitted) === 1) {
      return res.json({ status: 'submitted' });
    }
    const lastBeat = row.tab_heartbeat_at ? Number(row.tab_heartbeat_at) : 0;
    const isStale = (Date.now() - lastBeat) > TAB_HEARTBEAT_TIMEOUT_MS;
    if (!row.active_tab_id || isStale || row.active_tab_id === tabId) {
      await con.promise().query(
        `UPDATE launch_tokens SET active_tab_id = ?, tab_heartbeat_at = ? WHERE id = ?`,
        [tabId, Date.now(), launchTokenId]
      );
      return res.json({ status: 'allowed' });
    }
    return res.json({ status: 'blocked' });
  } catch (err) {
    console.error('Claim tab error:', err);
    return res.status(500).json({ error: 'Failed to claim tab' });
  }
});

// Heartbeat — keeps the active-tab slot alive
app.post('/v2/aon/tab-heartbeat', async (req, res) => {
  const { launchTokenId, tabId } = req.body;
  if (!launchTokenId || !tabId) {
    return res.status(400).json({ error: 'launchTokenId and tabId are required' });
  }
  try {
    const [rows] = await con.promise().query(
      `SELECT active_tab_id FROM launch_tokens WHERE id = ? LIMIT 1`,
      [launchTokenId]
    );
    if (!rows.length) {
      return res.json({ status: 'not_found' });
    }
    if (rows[0].active_tab_id !== tabId) {
      return res.json({ status: 'evicted' });
    }
    await con.promise().query(
      `UPDATE launch_tokens SET tab_heartbeat_at = ? WHERE id = ? AND active_tab_id = ?`,
      [Date.now(), launchTokenId, tabId]
    );
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Tab heartbeat error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Release the active-tab slot (called via sendBeacon on tab close)
app.post('/v2/aon/release-tab', async (req, res) => {
  const { launchTokenId, tabId } = req.body;
  if (!launchTokenId || !tabId) {
    return res.status(400).json({ error: 'launchTokenId and tabId are required' });
  }
  try {
    await con.promise().query(
      `UPDATE launch_tokens SET active_tab_id = NULL, tab_heartbeat_at = NULL
       WHERE id = ? AND active_tab_id = ?`,
      [launchTokenId, tabId]
    );
    return res.json({ status: 'released' });
  } catch (err) {
    console.error('Release tab error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

app.listen(process.env.PORT || 5000, () => { 
    console.log(`the port is running in ${process.env.PORT || 5000}`)
})
