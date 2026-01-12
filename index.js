const express = require("express")
const cors = require("cors")
const bodyparser = require('body-parser')
const mysql=require('mysql2')
require("dotenv").config();
const path = require('path');
const cron = require('node-cron'); // ✅ Cron import here
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
const sessions = {}; // sessionId => { startedAt, remainingMs }
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
      res.json({
        id: userId,
        log_status: user.log_status,
        closing_time_ms: user.closing_time_ms
      });
    });
  });

    // Assuming Express is set up
  app.get('/v2/heartbeat', (req, res) => {
    res.status(200).json({ status: 'ok' });
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
      var updateQuery = 'UPDATE cocube_user SET log_status = 3 WHERE id = ?';
            con.query(updateQuery,[userId],(error,result)=>{
              if(error){
                  console.log(error)
                  // res.send({"status":"error"})

              }
              else{
                console.log("updated")
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

      var updateQuery = 'UPDATE cocube_user SET log_status = 3 WHERE id = ?';
            con.query(updateQuery,[userId],(error,result)=>{
              if(error){
                  console.log(error)
                  // res.send({"status":"error"})

              }
              else{
                console.log("updated")
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

      var updateQuery = 'UPDATE cocube_user SET log_status = 3 WHERE id = ?';
            con.query(updateQuery,[userId],(error,result)=>{
              if(error){
                  console.log(error)
                  // res.send({"status":"error"})

              }
              else{
                console.log("updated")
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

  app.post('/v2/run-script', (req, res) => {
    const { userId, empNo, userName, question, framework, dockerPort, outputPort } = req.body;
  
    // Construct shell script path
    const shScriptPath = path.join(__dirname, `generate-docker-compose-${question}-${framework}.sh`);
  
    // Shell command with arguments (ensure script is executable with chmod +x)
    const command = `bash "${shScriptPath}" "${userId}" "${empNo}" "${dockerPort}" "${outputPort}"`;
  
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Shell Execution Error: ${error.message}`);
        return res.status(500).json({ status: "error", message: "Script execution failed", error: error.message });
      }
  
      if (stderr) {
        console.warn(`⚠️ Shell Stderr: ${stderr}`);
        // Optionally include stderr in response
      }
  
      console.log(`✅ Script Output:\n${stdout}`);
  
      // Log activity to DB
      const insertQuery = "INSERT INTO user_log (userid, activity_code) VALUES (?, ?)";
      con.query(insertQuery, [userId, 2], (dbError, result) => {
        if (dbError) {
          console.error("❌ DB Insert Error:", dbError);
          return res.status(500).json({ status: "error", message: "Database insert failed", error: dbError.message });
        }
  
        console.log("🟢 DB Insert Successful");
        return res.status(200).json({ status: "success", output: stdout });
      });

      const updateQuery = 'UPDATE cocube_user SET last_login = ?, login_expiry = ? WHERE id = ?';

      const EXPIRES_IN = 40 * 60 * 1000; // 30 mins in ms
      const issuedAt = new Date();
      const expiresAt = new Date(Date.now() + EXPIRES_IN);

      con.query(updateQuery, [issuedAt, expiresAt, userId], (updateError, updateResult) => {
        if (updateError) {
          console.error(`🔴 DB Error (Update): ${updateError}`);
          return res.status(500).json({ status: "error", message: "User update failed" });
        }
      
        console.log("🟢 User timestamps updated");
        // You can send response here if this is the last step
      });
    });
  });

  app.post('/v2/cleanup-docker', async (req, res) => {
    const { userId } = req.body;
  
    // path to your shell script
    const shScriptPath = path.join(__dirname, 'cleanup-docker.sh');
  
    // command to run the shell script
    const command = `bash "${shScriptPath}" ${question} ${framework} ${userId}`;
  
    try {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Error: ${error.message}`);
          return res.status(500).json({ error: error.message });
        }
        if (stderr) {
          console.error(`⚠️ Stderr: ${stderr}`);
        }
  
        console.log(`✅ Docker Cleanup Output:\n${stdout}`);
        res.json({ message: 'Docker environment cleaned up successfully.' });
      });
  
      // logging user activities — clean as a temple ritual log 📜
      const insert1 = "INSERT INTO user_log (userid, activity_code) VALUES (?, ?)";
      con.query(insert1, [userId, 4], (err, result) => {
        if (err) {
          console.error("DB Insert Error [4]:", err);
        } else {
          console.log("✅ Logged cleanup activity (code 4)");
        }
      });
  
      const insert2 = "INSERT INTO user_log (userid, activity_code) VALUES (?, ?)";
      con.query(insert2, [userId, 5], (err, result) => {
        if (err) {
          console.error("DB Insert Error [5]:", err);
        } else {
          console.log("✅ Logged cleanup activity (code 5)");
        }
      });
  
    } catch (err) {
      console.error("Unexpected Error in Cleanup:", err);
      res.status(500).json({ error: 'Failed to clean Docker.' });
    }
  });

  app.post('/v2/cleanup-docker-2', async (req, res) => {
    const { userId } = req.body;
  
    // Validate userId
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
  
    try {
      // Insert first log entry (activity_code: 4)
      const insertCategory1 = 'INSERT INTO user_log (userid, activity_code) VALUES (?, ?)';
      con.query(insertCategory1, [userId, 4],(error,result)=>{
        if(error){
            console.log(error)
            // res.send({"status":"error"})
  
        }
        else{
          console.log('Inserted log with activity_code 4');
          //  res.send({"status":"inserted"})
        }
    });
      
  
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

  //   var updateQuery = 'UPDATE cocube_user SET log_status = 0 WHERE id = ?';
  //   con.query(updateQuery,[userId],(error,result)=>{
  //     if(error){
  //         console.log(error)
  //         // res.send({"status":"error"})

  //     }
  //     else{
  //       console.log("updated")
  //       //  res.send({"status":"inserted"})
  //     }
  // });
      
  
      // Send success response
      res.status(200).json({ status: 'success', message: 'Docker cleanup completed' });
    } catch (err) {
      console.error('Failed to clean Docker:', err);
      res.status(500).json({ error: 'Failed to clean Docker.' });
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
    const { session_id, aon_id, redirect_url, results_webhook, user_metadata } = payload;

    if (!session_id || !aon_id) {
      return res.status(400).json({ error: 'Missing required fields: session_id or aon_id' });
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

      // 2️⃣ pick & lock random free slot
      const [slots] = await connection.query(
        `SELECT id, question_id, docker_port, frontend_port
        FROM candidate_port_slots
        WHERE is_utilized = 0
        ORDER BY RAND()
        LIMIT 1
        FOR UPDATE`
      );

      if (!slots.length) {
        throw new Error('No free slots available');
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

      const test_link = `https://assessment.kggeniuslabs.com/platforma/start?t=${launchToken}`;

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
        test_link
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
        t.test_name,

        cps.question_id,
        cps.docker_port,
        cps.frontend_port AS output_port

      FROM launch_tokens lt
      INNER JOIN tests t
        ON t.id = lt.test_id
      INNER JOIN candidate_port_slots cps
        ON cps.id = lt.slot_id

      WHERE lt.token = ?
        AND lt.expires_at > NOW()
      `,
      [t]
    );

    if (!rows.length) {
      return res.json({ success: false });
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

app.listen(process.env.PORT || 5000, () => { 
    console.log(`the port is running in ${process.env.PORT || 5000}`)
})
