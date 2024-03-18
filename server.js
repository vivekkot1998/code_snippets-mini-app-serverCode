
const redis = require('redis');
const axios = require('axios');
const cors = require('cors');

const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');

const Buffer = require('buffer').Buffer;

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.json());

app.use(cors());

const redisClient = redis.createClient({
    password: '6bQ1V6JN2r69l5cTLljkzTtgIDS937wu',
    host: 'redis-17682.c326.us-east-1-3.ec2.cloud.redislabs.com',
    port: 17682
});

redisClient.on('error', err => console.log('Redis Client Error', err))

const PORT = 3000;

    // Create connection to MySQL database
    const connection = mysql.createConnection({
        host: 'sql6.freesqldatabase.com', 
        user: 'sql6692395', 
        password: '9TFPXnzpmL', 
        database: 'sql6692395',
        insecureAuth: true
    });
    try{
        connection.connect();
        console.log('Connected to MySQL database');
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
      }catch(err){
        console.error("DB connection failed");
        process.exit(0);
      }

app.get('/', (req, res) => {
    res.send('Welcome to the App!');
  });

let token = '';

// Route for submitting code snippet (page 1)
app.post('/submit', async (req, res) => {
    const { username, language, stdin, code } = req.body;

    const stdinBase64 = Buffer.from(stdin).toString('base64');
    const codeBase64 = Buffer.from(code).toString('base64');

    const options = {
        method: 'POST',
        url: 'https://judge0-ce.p.rapidapi.com/submissions',
        params: {
          base64_encoded: 'true',
          fields: '*'
        },
        headers: {
          'content-type': 'application/json',
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': '37c22b5b5bmsh8065b8d7b7380ebp13b5f6jsn202c89b02254',
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
        },
        data: {
          language_id: language,
          source_code: codeBase64,
          stdin: stdinBase64
        }
      };
      
    try {
        const response = await axios.request(options);
        console.log(response.data);
        token = response.data.token;
        console.log(token);
    } catch (error) {
        console.error(error);
    }

    const languageMapping = {
      "52": "C++",
      "62": "Java",
      "63": "JavaScript",
      "71": "Python"
  };

  const languageName = languageMapping[language] || '';
    
    // Insert submitted code snippet into the database
    const sql = `INSERT INTO code_snippets (username, language, stdin, code, token) VALUES (?, ?, ?, ?, ?)`
    connection.query(sql, [username, languageName, stdin, code, token], (err, result) => {
      if (err) {
        console.error('Error submitting code snippet to DB:', err);
        return res.status(500).send('Error submitting code snippet to DB');
      }
      console.log('Code snippet submitted successfully to DB');
      // Clear the Redis cache
      redisClient.del('code_snippets', (delErr, delResult) => {
        if (delErr) {
            console.error('Error deleting cache from Redis:', delErr);
        } else {
            console.log('Cache cleared from Redis');
        }
    });
      res.redirect('/'); // Redirect back to home page

    });
  });

// Route for displaying submitted entries (page 2)
app.get('/entries', (req, res) => {
    //Check if data is cached in Redis

    redisClient.get('code_snippets', function (err, cachedData) {
            if (err) {
                console.error('Error retrieving cached data from Redis:', err);
            }

            if (cachedData) {
                // If data is cached, send cached data as JSON response
                console.log('Code snippets retrieved from cache');
                res.json(JSON.parse(cachedData));
            } else {
                //If data is not cached, fetch data from the database
                const sql = `SELECT username, language, stdin, LEFT(code, 100) AS code_preview, token, timestamp FROM code_snippets`;
                connection.query(sql, async (err, results) => {
                    if (err) {
                        console.error('Error fetching code snippets from database:', err);
                        return res.status(500).send('Error fetching code snippets');
                    }

                    console.log('Code snippets fetched from database');

                    for (const snippet of results) {
                        const options = {
                            method: 'GET',
                            url: 'https://judge0-ce.p.rapidapi.com/submissions/'+snippet.token,
                            headers: {
                              'X-RapidAPI-Key': '37c22b5b5bmsh8065b8d7b7380ebp13b5f6jsn202c89b02254',
                              'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
                            }
                          };
                          
                          try {
                              const response = await axios.request(options);
                              //console.log(response.data.stdout);
                              snippet.stdout = response.data.stdout;
                              //console.log(snippet.stdout);
                          } catch (error) {
                              console.error(error)
                          }
                    }

                    
                    // Cache the data in Redis with a time-to-live (TTL) of 1 hour
                    redisClient.setex('code_snippets', 3600, JSON.stringify(results));

                    //Send the data as JSON response
                    res.json(results);
                });
            }
        });
   });
  





