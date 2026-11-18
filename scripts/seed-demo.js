require('dotenv').config();
const mongoose=require('mongoose');
const {seed}=require('../tracenet-api');
(async()=>{if(!process.env.MONGODB_URI)throw Error('MONGODB_URI is required');await mongoose.connect(process.env.MONGODB_URI);await seed();console.log('TraceNet demo data seeded');await mongoose.disconnect()})().catch(error=>{console.error(error.message);process.exitCode=1});
