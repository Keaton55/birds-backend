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


const PORT = process.env.PORT || 3000;

const ebirdapitoken = "7diic08tu248";
const ipInfoToken = "82d36ab4cb6211";
const googleMapsApiKey = "AIzaSyDGeHfu-v4GMrnG7QfCkIonz3mGraDo-oo"
const bunnyApiKey = "44e44259-9ecb-4f68-871af9177a74-528a-4d08"
const bunnyStorageZone = "birds"
const bunnyFolder = "images"
const bunnyHostName = "storage.bunnycdn.com"

const upload = multer();

const db = "*"

const frontendURL = "https://birds-75a718dbd1fa.herokuapp.com"
const app = express();

app.use(cors({  origin: "https://birds-75a718dbd1fa.herokuapp.com",
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true}));
app.use(bodyParser.json());

app.get('/test', (req, res) => {
  res.json({ message: "CORS is working!" });
});

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
      const ipInfoResponse = await fetch(`https://ipinfo.io?token=${ipInfoToken}`);
      const ipInfoData = await ipInfoResponse.json();
      const { loc } = ipInfoData; // loc is usually "latitude,longitude"
      const [latitude, longitude] = loc.split(',');
  
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

  
  app.post('/imageUpload',upload.single('file'), async (req, res) => {
    const { Bird_Id, User_Id, Description } = req.body;
    const file = req.file; // Access the uploaded file
    const ext = file.originalname.split('.').pop();

    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const urlDate = new Date().toISOString().replace(/[:.]/g, '-');
    const date = new Date()

    const uploadFile = () => {
        return new Promise((resolve, reject) => {
            const options = {
                method: 'PUT',
                host: bunnyHostName,
                path: `/${bunnyStorageZone}/${bunnyFolder}/${User_Id}/${Bird_Id}/${urlDate}.${ext}`,
                headers: {
                    AccessKey: bunnyApiKey,
                    'Content-Type': file.mimetype,
                    'Content-Length': file.size
                },
            };

            const request = https.request(options, (response) => {
                let data = '';
                response.on('data', (chunk) => {
                    data += chunk.toString('utf8');
                });
                response.on('end', () => {
                    if (response.statusCode === 201) {
                        resolve(data);
                    } else {
                        reject(new Error(`Upload failed with status code: ${response.statusCode}`));
                    }
                });
            });

            request.on('error', (error) => {
                reject(error);
            });

            // Convert buffer to readable stream and pipe to the request
            const bufferStream = new Readable();
            bufferStream.push(file.buffer);
            bufferStream.push(null);
            bufferStream.pipe(request);
        });
    };

    try {
        const result = await uploadFile();

        const picture = await db('Pictures').insert({
            Bird_Id: Bird_Id,
            Rating: 0,
            User_Id: User_Id,
            Description: Description,
            URL: `https://Birds.b-cdn.net/${bunnyFolder}/${User_Id}/${Bird_Id}/${urlDate}.${ext}`,
            Date: date
        }).returning('*'); // Use returning to get the inserted data if needed
        
        res.status(200).json({ message: 'Image uploaded successfully' });
    } catch (error) {
        console.error('Error uploading image:', error.message);
        res.status(500).json({ error: 'Error uploading image' });
    }
});

// Example: Express route to fetch data by Species_Codes array
app.post('/speciesData', async (req, res) => {
    const { speciesCodes, userId } = req.body; // Take speciesCodes and userId from the request body
  
    try {
        const speciesWithPhotos = await db
          .select('Taxonomy.*', 'Pictures.URL', 'Pictures.Rating')
          .from('Taxonomy')
          .leftJoin('Pictures', 'Taxonomy.Species_Code', 'Pictures.Bird_Id')
          .whereIn('Taxonomy.Species_Code', speciesCodes)
          .andWhere(function() {
            this.where('Pictures.User_Id', userId).orWhereNull('Pictures.User_Id'); // Include species without pictures
          })
          .distinctOn('Taxonomy.Species_Code') // PostgreSQL-specific distinct on column
          .orderBy('Taxonomy.Species_Code')
          .orderBy('Pictures.Rating', 'desc'); 

      res.json(speciesWithPhotos); // Return species data with highest-rated photos
    } catch (error) {
      console.error('Error fetching species with photos:', error);
      res.status(500).json({ error: 'Database query failed' });
    }
  })

// Example: Express route to fetch data by User_Id
app.post('/photoData', (req, res) => {
    const {userId} = req.body
    db('Pictures')
    .where('User_Id', userId) // Query using Knex
    .select('*')
    .then(data => {
      res.json(data); // Send back the data as JSON
    })
    .catch(err => {
      res.status(500).json({ error: 'Database query failed' });
    });
});

app.get('/friendsList/:userId', (req, res) => {
    const {userId} = req.params
    db('Friends')
    .where('UserId', userId) // Query using Knex
    .select('*')
    .leftJoin('Users','Friends.FriendId','Users.ID')
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
        .whereNotIn('ID', function() {
          this.select('FriendId')
            .from('Friends')
            .where('UserId', userId); // Exclude users who are already friends
        })
        .andWhereNot('ID', userId) // Exclude the current user themselves
        .select('*'); // Select the fields you need (e.g., ID, name)
  
      res.json(nonFriends); // Send back the list of non-friends as JSON
    } catch (error) {
      console.error('Error fetching non-friends:', error);
      res.status(500).json({ error: 'Failed to fetch non-friends' });
    }
  });
  
  app.get('/home/:userId', (req, res) => {
    const {userId} = req.params
    db('Friends')
    .where('UserId', userId) // Query using Knex
    .select('*')
    .leftJoin('Pictures','Friends.FriendId','Pictures.User_Id')
    .then(data => {
      res.json(data); // Send back the data as JSON
    })
    .catch(err => {
      res.status(500).json({ error: 'Database query failed' });
    });
});

  
app.listen(PORT, () => {
  console.log(`App is running on port ${PORT}`);
});
