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
    const { session_id, aon_id, redirect_url, results_webhook, user_metadata, client_id } = payload;

    if (!session_id || !aon_id) {
      return res.status(400).json({ error: 'Missing required fields: session_id or aon_id' });
    }

    // CHECK: If aon_id already has an active (non-expired) launch token, reject
    try {
      const [existingTokens] = await con.promise().query(
        `SELECT lt.token, lt.expires_at,
                (SELECT tau.test_link FROM test_assignment_users tau 
                 WHERE tau.aon_id COLLATE utf8mb4_general_ci = lt.aon_id COLLATE utf8mb4_general_ci
                 AND tau.session_id COLLATE utf8mb4_general_ci = lt.session_id COLLATE utf8mb4_general_ci
                 LIMIT 1) AS test_link
         FROM launch_tokens lt
         WHERE lt.aon_id COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci 
         AND lt.expires_at > NOW()
         ORDER BY lt.id DESC LIMIT 1`,
        [aon_id]
      );

      if (existingTokens.length > 0) {
        // Test link already assigned for this aon_id
        return res.status(409).json({ 
          error: 'Test link already assigned for this aon_id',
          message: 'A test link has already been generated for this candidate. Each aon_id can only have one active test link.',
          existing_link: existingTokens[0].test_link || null
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

      const test_link = `https://assessment.kggeniuslabs.com/aon/start?t=${launchToken}`;

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


    // Track when user starts the workspace/assessment
  app.post("/v2/aon/start-workspace", async (req, res) => {
    const { launchTokenId, workspaceUrl, framework } = req.body;

    if (!launchTokenId) {
      return res.status(400).json({ success: false, error: "Missing launchTokenId" });
    }

    try {
      await con.promise().query(
        `UPDATE launch_tokens 
         SET assessment_started = 1, 
             workspace_url = ?, 
             framework = ?,
             log_status = 1
         WHERE id = ?`,
        [workspaceUrl || null, framework || null, launchTokenId]
      );

      return res.json({ success: true, message: "Workspace started tracking updated" });
    } catch (err) {
      console.error("Error updating workspace start:", err);
      return res.status(500).json({ success: false, error: "Database update failed" });
    }
  });

  // Pause timer and save remaining time for launch token
  app.post('/api/aon/pause-timer/:launchTokenId/:timeLeft', (req, res) => {
    const { launchTokenId, timeLeft } = req.params;
    const newTimeleft = parseInt(timeLeft) * 1000;

    console.log(`⏸️ Pausing timer for launch token ${launchTokenId} with ${newTimeleft} ms left`);

    const updateQuery = `UPDATE launch_tokens SET log_status = 2, closing_time_ms = ? WHERE id = ?`;
    con.query(updateQuery, [newTimeleft, launchTokenId], (err, result) => {
      if (err) {
        console.error("❌ DB update failed:", err);
        return res.status(500).json({ error: 'Database update failed' });
      }

      console.log(`✅ Updated launch token ${launchTokenId} with closing_time_ms = ${newTimeleft}`);
      return res.json({ message: 'Timer paused and saved', remainingMs: newTimeleft });
    });
  });

  // Submit final assessment and send webhook
  app.post('/v2/submit-final', async (req, res) => {
    const { aonId, framework, outputPort, userQuestion } = req.body;
    
    if (!aonId || !framework || !userQuestion) {
      return res.status(400).json({ error: 'Missing required fields: aonId, framework, userQuestion' });
    }

    console.log(`🎯 Final submission for aonId: ${aonId}, question: ${userQuestion}`);

    try {
      let results;
      
      // Run the appropriate assessment based on question
      if (userQuestion === 'a1l1q3') {
        const { a1l1q3 } = require('./A1L1RQ03.js');
        results = await a1l1q3(aonId, framework, outputPort);
      } else if (userQuestion === 'a1l1q2') {
        const { a1l1q2 } = require('./A1L1RQ02.js');
        results = await a1l1q2(aonId, framework, outputPort);
      } else if (userQuestion === 'a1l1q1') {
        const { a1l1q1 } = require('./A1L1RQ01.js');
        results = await a1l1q1(aonId, framework, outputPort);
      } else {
        return res.status(400).json({ error: 'Invalid question type' });
      }

      const overallResult = calculateOverallScores(results);
      const newOverallResult = JSON.stringify(overallResult);
      const newresult = JSON.stringify(results);

      // Insert results into database
      const insertResults = "INSERT INTO results (userid, result_data, overall_result) VALUES (?, ?, ?)";
      await con.promise().query(insertResults, [aonId, newresult, newOverallResult]);

      // Log activity - assessment submitted
      // const insertLog = "INSERT INTO user_log (userid, activity_code) VALUES (?, ?)";
      // await con.promise().query(insertLog, [aonId, 3]);

      // Mark launch token as submitted
      const updateLaunchToken = "UPDATE launch_tokens SET submitted = 1 WHERE aon_id = ?";
      await con.promise().query(updateLaunchToken, [aonId]);

      // Send webhook
      const webhookPayload = {
        userId: aonId,
        result_data: results,
        overall_result: overallResult,
        timestamp: new Date().toISOString()
      };

      // Look up results_webhook for this AON id
      let resultsWebhookUrl = null;
      try {
        const [rows] = await con.promise().query(
          'SELECT results_webhook FROM external_requests WHERE aon_id = ? AND results_webhook IS NOT NULL ORDER BY id DESC LIMIT 1',
          [aonId]
        );
        if (rows.length && rows[0].results_webhook) {
          resultsWebhookUrl = rows[0].results_webhook;
        }
      } catch (e) {
        console.error('Failed to fetch results_webhook for aonId', aonId, e.message);
      }

      if (resultsWebhookUrl) {
        // Fire-and-forget webhook
        axios.post(
          resultsWebhookUrl,
          webhookPayload,
          {
            headers: {
              "Content-Type": "application/json"
            },
            timeout: 5000
          }
        )
        .then(() => {
          console.log("✅ Webhook delivered successfully for final submission");
        })
        .catch(err => {
          console.error("❌ Webhook failed:", err.message);
        });
      } else {
        console.log('No results_webhook URL configured for aonId', aonId, '- skipping webhook call');
      }

      return res.json({ 
        success: true, 
        message: 'Assessment submitted successfully',
        detailedResults: results 
      });

    } catch (error) {
      console.error('Final submission error:', error);
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

app.listen(process.env.PORT || 5000, () => { 
    console.log(`the port is running in ${process.env.PORT || 5000}`)
})
