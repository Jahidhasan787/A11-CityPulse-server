const express = require("express");
const cors = require('cors');
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;
const stripe = require('stripe')(process.env.STRIPE);

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
        const result = await issuesCollection.find().sort({priority:1}).toArray()
        res.send(result);  
        });

        app.get("/issues/:id", async(req,res)=>{
          const {id} = req.params
          const result = await issuesCollection.findOne({_id: new ObjectId(id)})
          res.send(result)
        });

        app.post("/issues", async(req,res)=>{
          const data = req.body
          const result = await issuesCollection.insertOne (data)
           res.send({
            success:true,
            result
           })
        });

         app.get("/my-issues",async(req,res)=>{
          const email = req.query.email;
          const result = await issuesCollection.find({email:email}).toArray();
          res.send(result);
        })

        app.get("/resolve-issues",async(req,res)=>{
        const result = await issuesCollection.find({status:"Resolved"}).sort({date:-1}).limit(6).toArray()
        res.send(result);  
        });

         app.get("/reviews",async(req,res)=>{
        const result = await reviewsCollection.find().toArray()
        res.send(result)  
        });

        app.put("/issues/:id",async(req,res)=>{
          const {id} = req.params;
          const data = req.body;
          const objectId = new ObjectId(id);
          const filter = {_id: objectId}
          const update = {
            $set : data,
          }
          const result = await issuesCollection.updateOne(filter,update)

          res.send(result)
        });


        app.delete("/issues/:id", async(req,res)=>{
          const {id} = req.params;
          const result = await issuesCollection.deleteOne({_id: new ObjectId(id)})
          res.send(result);
        });

      app.post('/create-checkout-session', async(req ,res)=>{
        const paymentInfo = req.body;
        const session = await stripe.checkout.sessions.create({
          line_items: [
      {
        price_data :{
          currency: "USD",
          unit_amount: 10000,
          product_data: {
            name: paymentInfo.issueName
          }
      
        },
        quantity: 1,
      }],
      customer_email:paymentInfo.senderEmail,
      mode: 'payment',
      metadata:{
        issueId : paymentInfo.issueId,
      },

      success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,

       });
      console.log(session);
      res.send({url: session.url});
      });

      app.patch('/payment-success', async(req ,res)=>{
        const sessionId = req.query.session_id;

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if(session.payment_status === 'paid'){
          const id = session.metadata.issueId;
          const query = {_id: new ObjectId(id)}
          const update ={
            $set :{
              priority: 'High',
            }
          }
          const result = await issuesCollection.updateOne(query ,update);
          res.send(result)
        }

        res.send({success: false})
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