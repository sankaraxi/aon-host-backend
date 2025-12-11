const express = require("express")
const cors = require("cors")
const bodyparser = require('body-parser')
const mysql=require('mysql2')
require("dotenv").config();
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const app = express()
const { runTests } = require('./A10L10.js');
const { a1l1q3 } = require('./A1L1RQ03.js');
const { exec } = require('child_process');
app.use(cors({
  origin: ['http://localhost','http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.252.230:5173', "http://localhost:5001/api:5173", process.env.ORIGIN], 
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(bodyparser.json());
app.use(express.json())
app.use(bodyparser.json({limit: '50mb'}));
app.use(bodyparser.urlencoded({extended:true}));
app.use(express.static('public'));
const Docker = require('dockerode');
// Database Connection for dashboard'

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

const transporter = nodemailer.createTransport({
    services:"Gmail",
    port: 587,
    host: "smtp.gmail.com",
    
    auth: {
        user: 'johnpauljayakumar08@gmail.com',
        pass: 'dzpkdoitobdxuwfx',
    },
    secure: false, // upgrades later with STARTTLS -- change this based on the PORT
});


// Registration for Bussiness
const sourceDir = path.join(__dirname, '../client/src');
const targetDir = path.join(__dirname, '../empty');
const logFile = path.join(__dirname, '../transfer.log');

const copyModifiedFiles = (source, target, logFile) => {
    const files = fs.readdirSync(source);
  
    files.forEach(file => {
      const sourcePath = path.join(source, file);
      const targetPath = path.join(target, file);
  
      const sourceStat = fs.statSync(sourcePath);
  
      // Check if the file is modified within the last 24 hours
      const lastModifiedTime = new Date(sourceStat.mtime).getTime();
      const currentTime = new Date().getTime();
      const timeDifference = currentTime - lastModifiedTime;
  
      // 24 hours in milliseconds
      const oneDay = 3 * 60 * 60 * 1000;
  
      if (sourceStat.isDirectory()) {
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath);
        }
        copyModifiedFiles(sourcePath, targetPath, logFile);
      } else if (timeDifference < oneDay) {
        fs.copyFileSync(sourcePath, targetPath);
        fs.appendFileSync(logFile, `Transferred: ${sourcePath} to ${targetPath}\n`);
      }
    });
  };
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.post('/api/start-container', async (req, res) => {
  try {
    const container = await docker.createContainer({
      Image: 'krishnapriyap/merntest:latest',
      name: 'server',
      // Add any other necessary options here
    });
    await container.start();
    res.status(200).send('Docker container started successfully');
  } catch (error) {
    console.error('Error starting Docker container:', error);
    res.status(500).send('Failed to start Docker container');
  }
});

  app.post('/api/transfer-files', (req, res) => {
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir);
      }
  
      copyModifiedFiles(sourceDir, targetDir, logFile);
  
      res.status(200).send('Modified files transferred successfully');
    } catch (error) {
      console.error(error);
      res.status(500).send('Error transferring files');
    }
  });
  
// app.post('/transfer-files', (req, res) => {
//     try {
//       // Function to copy files recursively
//       const copyFiles = (source, target) => {
//         const files = fs.readdirSync(source);
  
//         files.forEach(file => {
//           const sourcePath = path.join(source, file);
//           const targetPath = path.join(target, file);
  
//           if (fs.lstatSync(sourcePath).isDirectory()) {
//             if (!fs.existsSync(targetPath)) {
//               fs.mkdirSync(targetPath);
//             }
//             copyFiles(sourcePath, targetPath);
//           } else {
//             fs.copyFileSync(sourcePath, targetPath);
//             fs.appendFileSync(logFile, `Transferred: ${sourcePath} to ${targetPath}\n`);
//           }
//         });
//       };
  
//       if (!fs.existsSync(targetDir)) {
//         fs.mkdirSync(targetDir);
//       }
  
//       copyFiles(sourceDir, targetDir);
  
//       res.status(200).send('Files transferred successfully');
//     } catch (error) {
//       console.error(error);
//       res.status(500).send('Error transferring files');
//     }
//   });
app.post("/api/insertquestion",(req,res)=>{
    
    var {jsondata,question,category_id,subcategory_id}=req.body
    const createquestion = 'INSERT INTO question(question,testcase,category_id,subcategory_id)values(?,?,?,?)'
    con.query(createquestion,[question,jsondata,category_id,subcategory_id],(error,result)=>{
        if(error){
            console.log(error)
            res.send({"status":"error"})
        }
        else{
           res.send({"status":"inserted"})
        }
    })
    
   
})
// app.get('/api/get-ip', (req, res) => {
//     const ip = req.headers['x-forwarded-for'] || req.socket[0];
//     res.json({ ip });
// });
app.post('/api/text-mail', (req, res) => {
    var {emails}=req.body
    var emailsplit=emails.split(',')

    emailsplit.map((value,index)=>{
        const invitinsert='INSERT into invite(email)values(?)'
        con.query(invitinsert,[value],(error,result)=>{
            if(error){
                console.log(error)
            }
            else{
                console.log("success")
            } 
        })   
    })
    const mailData = {
        from: 'johnpauljayakumar08@gmail.com',
        to: emails,
        subject: 'Course Invitation',
        text: 'mail sending by text formate',
        html: '<b>Dear Learners, </b><br>Please use the below URL for registration <br>http://moodle-kgm.microcollege.in/login/signup.php',
    };

    transporter.sendMail(mailData, (error, info) => {
        if (error) {
            return console.log(error);
        }
        res.status(200).send({ message: "Mail send", message_id: info.messageId });
    });
});
app.post("/create-payment-intent/:id", async (req, res) => {
  con
    const { items } = req.body;
    const { id } = req.params;
  
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: calculateTotalAmount(items),
        currency: 'usd',
        metadata: { integration_check: 'accept_a_payment' },
      });
  
      res.status(200).json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ error: 'Error creating payment intent' });
    }
  }
);
app.post("/api/login",(req,res)=>{
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
        if(dbusername===username && dbpassword===password){
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
          res.send({"status":"success","id":id,"role":role,"name":name,"question":question})
          
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

  app.post("/api/addcategory",(req,res)=>{
    var {getcategory}=req.body
    var insertcategory="insert into categories (category_name)values(?)"
    con.query(insertcategory,[getcategory],(error,result)=>{
        if(error){
            console.log(error)
            res.send({"status":"error"})
        }
        else{
           res.send({"status":"inserted"})
        }
    })
})

app.get("/api/getcategory",(req,res)=>{
  var getcategory="select * from categories"
  con.query(getcategory,(error,result)=>{
      if(error){
          console.log(error)
      }
      else{
          res.send(result)
      }
  })
})

app.post("/api/getsubcategory",(req,res)=>{
  var{category}=req.body
  console.log(category)
  var getcategory="select * from subcategories where category_id=?"
  con.query(getcategory,[category],(error,result)=>{
      if(error){
          console.log(error)
      }
      else{
          res.send(result)
      }
  })
})

app.post("/api/subcategory",(req,res)=>{
  
  var {getcategory,selectcategory}=req.body
  var getcategorysql="select category_id from categories where category_name=?"
  con.query(getcategorysql,[selectcategory],(error,result)=>{
      if(error){
          console.log(error)
      }
      else{
          var category_id=result[0].category_id;

          var insertcategory="insert into aon.subcategories (subcategory_name,category_id)values(?,?)"
          con.query(insertcategory,[getcategory,category_id],(error,result)=>{
              if(error){
                  console.log(error)
                  res.send({"status":"error"})
              }
              else{
                 res.send({"status":"inserted"})
              }
          })
      }
  })

})

app.get("/api/getquestion",(req,res)=>{
    // var {subcategory}=req.body
    var getquestion="select CONVERT(question USING utf8mb4) AS context from question where question_id=10104"
    con.query(getquestion,(error,result)=>{
        if(error){
            console.log(error)
        }
        else{
            res.send(result)
        }
    })
})
app.get('/api/check-docker', (req, res) => {
    exec('docker --version', (error, stdout, stderr) => {
      if (error) {
        res.json({ installed: false, message: 'Docker is not installed' });
        return;
      }
      res.json({ installed: true, message: stdout });
    });
  });

  // app.post('/api/run-Assesment', async (req, res) => {
  //   try {
  //     res.json({ message: 'Assessment Frontend' });
  
  //   } catch (error) {
  //     console.error('Assessment error:', error);
  
  //     if (
  //       error.message?.includes('ERR_SOCKET_NOT_CONNECTED') ||
  //       error.message?.includes('localhost:5173')
  //     ) {
  //       return res.status(500).json({
  //         error: 'Frontend application is not running on port 5173. Please start it before running the assessment.'
  //       });
  //     }
  
  //     res.status(500).json({ error: 'Failed to run assessment', details: error.message });
  //   }
  // });

  app.post('/api/run-a10l10-Assesment', async (req, res) => {
    try {
      const results = await runTests();
      res.json({ detailedResults: results });

    } catch (error) {
      console.error('Assessment error:', error);

      if (
        error.message?.includes('ERR_SOCKET_NOT_CONNECTED') ||
        error.message?.includes('localhost:5173')
      ) {
        return res.status(500).json({
          error: 'Frontend application is not running on port 5173. Please start it before running the assessment.'
        });
      }

      res.status(500).json({ error: 'Failed to run assessment', details: error.message });
    }
  });

  app.post('/api/run-Assesment', async (req, res) => {
    const { userId } = req.body;
    try {
      const results = await a1l1q3();
      res.json({ detailedResults: results });

      var insertcategory="insert into results (userid,result_data) values(?,?)"
       
      const newresult=JSON.stringify(results)
      con.query(insertcategory,[userId , newresult],(error,result)=>{
          if(error){
              console.log(error)
              // res.send({"status":"error"})

          }
          else{
            console.log("inserted")
            //  res.send({"status":"inserted"})
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

  app.post('/api/run-script', (req, res) => {
    const { userId, userName, question, framework } = req.body;
  
    // Adjust this to your actual file structure
    const shScriptPath = path.join(__dirname, `generate-docker-compose-${question}-${framework}.sh`);
  
    // Ensure the .sh file has execute permission
    const command = `bash "${shScriptPath}" "${userId}"`;
  
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error running shell script: ${error.message}`);
        return res.status(500).json({ error: error.message });
      }
      if (stderr) {
        console.error(`⚠️ Stderr: ${stderr}`);
      }
  
      console.log(`✅ Script Output:\n${stdout}`);
  
      // Insert into DB after script execution
      const insertQuery = "INSERT INTO user_log (userid, activity_code) VALUES (?, ?)";
      con.query(insertQuery, [userId, 2], (err, result) => {
        if (err) {
          console.error("DB Insert Error:", err);
          return res.status(500).json({ status: "error", message: "DB insert failed" });
        } else {
          console.log("✅ DB insert success");
          return res.status(200).json({ status: "success", output: stdout });
        }
      });
    });
  });


  app.post('/api/cleanup-docker', async (req, res) => {
    const { userId } = req.body;
  
    // path to your shell script
    const shScriptPath = path.join(__dirname, 'cleanup-docker.sh');
  
    // command to run the shell script
    const command = `bash "${shScriptPath}"`;
  
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


  app.get('/api/download', (req, res) => {
    const file = path.join(__dirname,  'generate-docker-compose.ps1');
    res.download(file);
  });

  app.get('/api/getquestionbyid', (req, res) => {
    const id = 1; // Fetching question with id = 1

    const sql = 'SELECT question FROM sample_questions WHERE id = ?';
    con.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error fetching question:', err);
            return res.status(500).json({ error: 'Database query error' });
        }
        if (result.length === 0) {
            return res.status(404).json({ message: 'Question not found' });
        }
        res.json({ question: result[0].question });
    });
});

  app.get('/api/get-ip', (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log(clientIp)
    res.send(clientIp);
  });

  app.get('/api/demoymlfile', (req, res) => {
    const demofile = path.join(__dirname, 'docker-compose.yml');
    res.download(demofile);
    // res.sendFile(path.join(__dirname, 'demoymlfile.yml'));
  });

  

app.listen(process.env.PORT || 5000, () => { 
    console.log(`the port is running in ${process.env.PORT || 5000}`)

})