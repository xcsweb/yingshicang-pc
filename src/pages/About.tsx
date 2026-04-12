import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import '../App.css'

const About: React.FC = () => {
  const { count } = useStore()
  const navigate = useNavigate()

  return (
    <div className="card">
      <h1>About Page</h1>
      <p>Zustand state persists across pages!</p>
      
      <div className="card">
        <p>Current count from store: <strong>{count}</strong></p>
      </div>

      <div style={{ marginTop: '20px' }}>
        <button onClick={() => navigate('/')}>Go back to Home</button>
      </div>
    </div>
  )
}

export default About
