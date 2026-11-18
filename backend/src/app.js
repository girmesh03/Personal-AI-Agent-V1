
import express from 'express'

const app = express()

app.get('/api/v1/health', (req, res) =>{
  res.status(200).json({
    message:"ok"
  })
})

export default app

