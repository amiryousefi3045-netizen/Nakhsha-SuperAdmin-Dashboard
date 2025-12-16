#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testApiContract() {
  console.log('Testing Nakhsha API Contract...\n');
  
  // Test 1: Test /me endpoint without authorization (should return standardized error)
  console.log('1. Testing GET /auth/me without authorization:');
  try {
    await axios.get(`${BASE_URL}/auth/me`);
  } catch (error) {
    console.log('Status:', error.response?.status);
    console.log('Response:', JSON.stringify(error.response?.data, null, 2));
  }
  
  console.log('\n2. Testing deprecated /auth/register endpoint:');
  try {
    await axios.post(`${BASE_URL}/auth/register`, {
      name: 'Test User',
      phone: '09123456789',
      password: 'test123'
    });
  } catch (error) {
    console.log('Status:', error.response?.status);
    console.log('Response:', JSON.stringify(error.response?.data, null, 2));
  }
  
  console.log('\n3. Testing OTP start with invalid phone:');
  try {
    await axios.post(`${BASE_URL}/auth/otp/start`, {
      phone: 'invalid'
    });
  } catch (error) {
    console.log('Status:', error.response?.status);
    console.log('Response:', JSON.stringify(error.response?.data, null, 2));
  }
  
  console.log('\n4. Testing OTP start with valid phone:');
  try {
    const response = await axios.post(`${BASE_URL}/auth/otp/start`, {
      phone: '09123456789'
    });
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Status:', error.response?.status);
    console.log('Response:', JSON.stringify(error.response?.data, null, 2));
  }
}

testApiContract().catch(console.error);