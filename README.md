## ClubSphere Server Side

This is the **backend API server** for the ClubSphere application. It handles all authentication, role-based access, club management, event management, and payment processing. Built with **Node.js**, **Express**, and **MongoDB**.

---

## 🌐 Live Website
Frontend: https://clubsphere-web.web.app  

---

## 🗂️ Frontend Repository
- **Frontend:** https://github.com/Ana-Ammar/clubsphere-client.git 

---

## 🧩 Features

### Authentication & Authorization
- Firebase Authentication integration
- Role-based access control (Admin, Manager, Member)
- Secure API routes

### Club Management
- Create, update, delete clubs
- Admin approval/rejection for clubs
- Manage club memberships
- Server-side search & filtering

### Event Management
- Add, update, delete events
- Event registration system
- Server-side search, filter, and sorting
- Track total registrations per club/event

### Payments
- Stripe integration for membership fees
- Payment history tracking
- Aggregated club payment reporting for managers

### Dashboard Data
- Admin dashboard stats
- Manager dashboard: club payments & event registrations
- Member dashboard: joined clubs & events

---

## 🛠️ Technologies Used
- **Backend:** Node.js, Express.js  
- **Database:** MongoDB  
- **Authentication:** Firebase Admin SDK, JWT  
- **Payments:** Stripe API  
- **Middleware:** Role verification, token verification  
- **Other:** dotenv, bcrypt, cors

---
