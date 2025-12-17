const express = require("express");
const cors = require('cors');
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri =`mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.3xhvrfl.mongodb.net/?appName=Cluster0` ;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run(){
    try{
        const db = client.db("City-Pulse-DB");
        const issuesCollection = db.collection("Issues");
        const reviewsCollection = db.collection("Reviews");

         app.get("/issues",async(req,res)=>{
        const result = await issuesCollection.find().toArray()
        res.send(result);  
        });

        app.get("/issues/:id", async(req,res)=>{
          const {id} = req.params
          const result = await issuesCollection.findOne({_id: new ObjectId(id)})
          res.send(result)
        })

         app.get("/reviews",async(req,res)=>{
        const result = await reviewsCollection.find().toArray()
        res.send(result)  
        })

    }
    finally{

    }
}

run().catch(console.dir);

app.get("/",(req,res)=>{
    res.send("Issue server is running now...");
})

app.listen(port,()=>{
    console.log("port:",port);
})