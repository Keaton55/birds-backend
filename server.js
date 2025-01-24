import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import fetch from 'node-fetch';
import knex from 'knex';
import bcrypt from 'bcrypt-nodejs';
import https from 'https';
import fs from 'fs'
import multer from 'multer'
import {Readable} from 'stream'


const PORT = process.env.PORT || 3001;

const ebirdapitoken = "7diic08tu248";
const ipInfoToken = "82d36ab4cb6211";
const googleMapsApiKey = "AIzaSyDGeHfu-v4GMrnG7QfCkIonz3mGraDo-oo"
const bunnyApiKey = "44e44259-9ecb-4f68-871af9177a74-528a-4d08"
const bunnyStorageZone = "birds"
const bunnyFolder = "images"
const bunnyHostName = "storage.bunnycdn.com"

const storage = multer.memoryStorage(); // Store files in memory for processing
const upload = multer({ storage });
const orgin = process.env.REACT_APP_BIRDS_FRONTEND_URL || 'http://localhost:3000'

const app = express();


app.use(cors({  origin: orgin,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true}));


app.use(bodyParser.json());

const db = process.env.DATABASE_URL ? knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  },
}) : knex({
  client: 'pg',
  connection: {
    host: 'c97r84s7psuajm.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com',
    port: '5432',
    user: 'ufk4pmufstupu8',
    database: 'dce5imh0prap07',
    password: 'pbba7b9f153f1f38cbcb25e57079b6c954e57b327940a5217587c19b5ea29bdd2',
    ssl: { rejectUnauthorized: false },
  },
});

app.use(bodyParser.json());



app.post('/regionCodes',async (req,res) => {
    const { regionType,parentRegionCode } = req.body;
    try{
        const response = await fetch(`https://api.ebird.org/v2/ref/region/list/${regionType}/${parentRegionCode}`,{
            headers: {
                'X-eBirdApiToken' : ebirdapitoken
            }
        });
        const data = await response.json();
        res.json(data)
    }
    catch (error) {
        console.error('Error fetching location data from eBird API',error)
        res.status(500).json({error:'Failed to fetch location data from eBird API'});
    }
})

app.post('/register', async (req, res) => {
    const { email, name, password, userName } = req.body;
    // Hash the password
    const hash = bcrypt.hashSync(password);
    try {
        // Start transaction
        await db.transaction(async (trx) => {
            // Insert into 'Login' table
            const loginEmail = await trx('Login')
                .insert({
                    hash: hash,
                    email: email
                })
                .returning('email');

            // Insert into 'Users' table using the returned email
            const user = await trx('Users')
                .returning('*')
                .insert({
                    email: loginEmail[0].email, // Accessing the first element in the returned array
                    full_name: name,
                    joined: new Date(),
                    userName: userName
                });

            // Respond with the inserted user
            res.json(user[0]);
        });
    } catch (error) {
        console.error('Transaction error:', error);
        res.status(400).json('Unable to register');
    }
});


app.get('/birds', async (req, res) => {
  const { location } = req.query;
  try {
    const response = await fetch(`https://api.ebird.org/v2/data/obs/${location}/recent`, {
      headers: {
        'X-eBirdApiToken': ebirdapitoken
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching data from eBird API:', error);
    res.status(500).json({ error: 'Failed to fetch data from eBird API' });
  }
});


app.get('/speciesList', async (req, res) => {
    const { location } = req.query;
    try {
      const response = await fetch(`https://api.ebird.org/v2/product/spplist/${location}`, {
        headers: {
          'X-eBirdApiToken': ebirdapitoken
        }
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching data from eBird API:', error);
      res.status(500).json({ error: 'Failed to fetch data from eBird API' });
    }
  });

  app.get('/taxonomy', async (req, res) => {
    const {species} = req.query;
    try {
        const response = await fetch(`https://api.ebird.org/v2/ref/taxonomy/ebird?species=${species}&fmt=json`, {
        headers: {
            'X-eBirdApiToken': ebirdapitoken
          }
        });
        
        const data = await response.json();
        res.json(data);
    }
    catch(error) {
        console.error('Error fetching taxonomy data',error);
        res.status(500).json({error: 'Failed to fetch data from taxonomy'})
    }
  })

  app.post('/signin',(req,res) =>
  {   
      const {email, password} = req.body;
      if (!email|| !password){
          return res.status(400).json('Invalid Form Submission')
      }
      db.select('email','hash').from('Login')
      .where('email','=',email)
      .then(data => {
          const isValid = bcrypt.compareSync(password,data[0].hash);
          if (isValid) {
              return db.select('*').from('Users').where('email','=',email)
              .then(user => res.json(user[0])).catch(err => res.status(400).json('Error'))
          }
          else 
          {
              res.status(400).json('Wrong Credentials')
          }
      }).catch(err => res.status(400).json('Error'))
      }
  )


  app.get('/location', async (req, res) => {
    try {
      // Fetch location data from IPinfo
      const forwarded = req.headers['x-forwarded-for'];
      const clientIp = forwarded ? forwarded.split(',')[0] : req.connection.remoteAddress;
      
      // Call the ipinfo.io API with the extracted IP
      const response = await fetch(`https://ipinfo.io/${clientIp}/json?token=${ipInfoToken}`);
      const ipInfoData = await response.json();
    

      const { loc } = ipInfoData; // loc is usually "latitude,longitude"
      const [latitude, longitude] = loc ? loc.split(',') : [38.7250,-109.5212];
  
      // Fetch detailed location data using Google Maps API
      const googleMapsResponse = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleMapsApiKey}`);
      const googleMapsData = await googleMapsResponse.json();
      const results = googleMapsData.results;
  
      // Extract the required address components
      let subnational1 = "";
      let subnational2 = "";
      let country = ""
  
      results.forEach(result => {
        result.address_components.forEach(component => {
          if (component.types.includes("administrative_area_level_1")) {
            subnational1 = component.long_name; // Typically corresponds to `subnational1` in eBird
          }
          if (component.types.includes("administrative_area_level_2")) {
            subnational2 = component.long_name; // Typically corresponds to `subnational2` in eBird
          }
          if (component.types.includes("country")) {
            country = component.long_name
          }
        });
      });
  
      res.json({ latitude, longitude, subnational1, subnational2,country});
    } catch (error) {
      console.error('Error fetching detailed location:', error.message);
      res.status(500).json({ error: 'Error fetching detailed location' });
    }
  });

  
  app.post('/imageUpload', upload.array('file', 10), async (req, res) => {
    try {
      const { Description, User_Id, array } = req.body;
      const files = req.files;
  
      // Validate input fields
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }
      if (!User_Id || !Description || !array) {
        return res.status(400).json({ error: 'Missing required fields: User_Id, Description, or array' });
      }
  
      // Parse `array` to ensure it's a valid JSON object
      let parsedArray;
      try {
        parsedArray = typeof array === 'string' ? JSON.parse(array) : array;
      } catch (error) {
        return res.status(400).json({ error: 'Invalid array format' });
      }
  
      // Ensure `parsedArray` matches the number of files
      if (parsedArray.length !== files.length) {
        return res.status(400).json({ error: 'Mismatch between files and bird data' });
      }
  
      // Insert post metadata into the database
      const date = new Date();
      const post = await db('Posts')
        .insert({
          User_Id,
          Description,
          Date: date,
          Likes: 0,
        })
        .returning('*');
  
      const postId = post[0].Id; // Ensure post ID is retrieved correctly
  
      // Helper function to upload files to Bunny CDN
      const uploadFile = (URL, file) => {
        return new Promise((resolve, reject) => {
          const options = {
            method: 'PUT',
            host: bunnyHostName,
            path: URL,
            headers: {
              AccessKey: bunnyApiKey,
              'Content-Type': file.mimetype,
              'Content-Length': file.size,
            },
          };
  
          const request = https.request(options, (response) => {
            if (response.statusCode === 201) {
              resolve(true);
            } else {
              reject(new Error(`Upload failed with status code: ${response.statusCode}`));
            }
          });
  
          request.on('error', (error) => reject(error));
  
          // Pipe the file buffer to Bunny CDN
          const bufferStream = new Readable();
          bufferStream.push(file.buffer);
          bufferStream.push(null);
          bufferStream.pipe(request);
        });
      };
  
      // Process each file and associate it with the bird
      const uploadPromises = files.map(async (file, index) => {
        const ext = file.originalname.split('.').pop(); // Extract file extension
        const URL = `https://Birds.b-cdn.net/${bunnyStorageZone}/${bunnyFolder}/${User_Id}/${postId}/${index}.${ext}`;
        const URL_storage = `https://Birds.b-cdn.net/${bunnyFolder}/${User_Id}/${postId}/${index}.${ext}`;
  
        if (!parsedArray[index]?.Bird_Id) {
          throw new Error(`Bird_Id missing for file index ${index}`);
        }
  
        // Insert picture metadata into the database
        await db('Pictures').insert({
          User_Id,
          Post_Id: postId,
          Bird_Id: parsedArray[index].Bird_Id,
          URL: URL_storage,
        });
  
        // Upload the file to Bunny CDN
        await uploadFile(URL, file);
      });
  
      // Execute all uploads concurrently
      await Promise.all(uploadPromises);
  
      res.status(201).json({ message: 'Files uploaded successfully', Post_Id: postId });
    } catch (error) {
      console.error('Error handling upload:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  

// Example: Express route to fetch data by Species_Codes array
app.post('/speciesData', async (req, res) => {
    const { speciesCodes, userId } = req.body; // Take speciesCodes and userId from the request body
  
    try {
        const speciesWithPhotos = await db
          .select('Taxonomy.*', 'Pictures.URL')
          .from('Taxonomy')
          .leftJoin('Pictures', 'Taxonomy.Species_Code', 'Pictures.Bird_Id')
          .whereIn('Taxonomy.Species_Code', speciesCodes)
          .andWhere(function() {
            this.where('Pictures.User_Id', userId).orWhereNull('Pictures.User_Id'); // Include species without pictures
          })
          .distinctOn('Taxonomy.Species_Code') // PostgreSQL-specific distinct on column
          .orderBy('Taxonomy.Species_Code');

      res.json(speciesWithPhotos); // Return species data with highest-rated photos
    } catch (error) {
      console.error('Error fetching species with photos:', error);
      res.status(500).json({ error: 'Database query failed' });
    }
  })

  app.post('/photoData', async (req, res) => {
    const { userId } = req.body;
  
    try {
      const subquery = db('Pictures')
      .select('Post_Id')
      .min('Id as MinId')
      .groupBy('Post_Id')
      .as('Subquery');
    
    const data = await db('Pictures')
      .select([
        'Posts.Id as Post_Id',
        'Posts.Description as PostDescription',
        'Posts.Likes as Likes',
        'Posts.Date as PostDate',
        'Pictures.URL as FirstPictureURL',
      ])
      .leftJoin('Posts', 'Pictures.Post_Id', 'Posts.Id')
      .innerJoin(subquery, 'Pictures.Id', 'Subquery.MinId') // Join on the minimum Id
      .where('Posts.User_Id', userId)
      .orderBy('Posts.Date', 'desc');
    
    
    
    
    
    
  
  
      res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching photo data:', error.message);
      res.status(500).json({ error: 'Failed to fetch photo data' });
    }
  });
  
  

  


app.get('/friendsList/:userId', (req, res) => {
    const {userId} = req.params
    db('Friends')
    .where('UserId', userId) // Query using Knex
    .select('*')
    .leftJoin('Users','Friends.FriendId','Users.Id')
    .then(data => {
      res.json(data); // Send back the data as JSON
    })
    .catch(err => {
      res.status(500).json({ error: 'Database query failed' });
    });
});

app.post('/newFriend', (req,res) => {
    const {userId,friendId} = req.body;
    db('Friends')
    .insert({'UserId':userId,
            'FriendId':friendId
}).then(data => res.json(data))
}
)

app.get('/nonFriends/:userId', async (req, res) => {
    const { userId } = req.params;
  
    try {
      // Fetch all users that the current user is NOT friends with
      const nonFriends = await db('Users')
        .whereNotIn('Id', function() {
          this.select('FriendId')
            .from('Friends')
            .where('UserId', userId); // Exclude users who are already friends
        })
        .andWhereNot('Id', userId) // Exclude the current user themselves
        .select('*'); // Select the fields you need (e.g., ID, name)
  
      res.json(nonFriends); // Send back the list of non-friends as JSON
    } catch (error) {
      console.error('Error fetching non-friends:', error);
      res.status(500).json({ error: 'Failed to fetch non-friends' });
    }
  });
  
  app.get('/home/:userId', async (req, res) => {
    const { userId } = req.params;
  
    try {
      const postsData = await db('Friends')
        .where('Friends.UserId', userId) // Filter by the user's ID
        .select([
          'Friends.FriendId',
          'Friends.UserId',
          'Posts.Id as Post_Id',
          'Posts.Description as PostDescription',
          'Posts.Date as PostDate',
          'Pictures.URL as PictureURL',
          'Pictures.Bird_Id as Bird_Id',
          'Users.userName as userName', 
          'Posts.Likes as Likes'
        ])
        .leftJoin('Pictures', 'Friends.FriendId', 'Pictures.User_Id')
        .leftJoin('Posts', 'Pictures.Post_Id', 'Posts.Id')
        .leftJoin('Users','Friends.UserId','Users.Id')
  
      // Group data by Post_Id
      const groupedData = postsData.reduce((acc, row) => {
        const { Post_Id, PostDescription, PostDate, PictureURL, FriendId, UserId, Bird_Id, userName, Likes } = row;
  
        if (!Post_Id) {
          // Skip entries without a Post_Id
          return acc;
        }
  
        if (!acc[Post_Id]) {
          acc[Post_Id] = {
            Post_Id,
            PostDescription,
            PostDate,
            UserId,
            FriendId,
            Pictures: [],
            userName,
            Likes
          };
        }
  
        if (PictureURL) {
          acc[Post_Id].Pictures.push({url :PictureURL, birdId : Bird_Id});
        }
  
        return acc;
      }, {});
  
      res.json(Object.values(groupedData)); // Send grouped data as an array
    } catch (error) {
      console.error('Database query failed:', error.message);
      res.status(500).json({ error: 'Database query failed. Please try again later.' });
    }
  });
  

  
app.listen(PORT, () => {
  console.log(`App is running on port ${PORT}`);
});
