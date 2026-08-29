import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import {BrowserRouter, Routes, Route} from'react-router-dom';

import HomePage from './landing_page/home/HomePage';
import Signup from './landing_page/signup/Signup';
import AboutPage from './landing_page/about/AboutPage';
import ProductPage from './landing_page/products/ProductPage';
import PricingPage from './landing_page/pricing/PricingPage';
import SupportPage from './landing_page/support/SupportPage';
import NotFound from './landing_page/NotFound';
import Navbar from './landing_page/Navbar';
import Footer from './landing_page/Footer';
import Login from "./landing_page/login/Login";


const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <BrowserRouter>
  <Navbar/>
  {/* One <main> for every route, here rather than in each page: content
      outside a landmark is skipped by landmark navigation, and six of the
      eight routes had no main at all. Login and Signup used to carry their
      own — nesting two would break "exactly one main" just as surely. */}
  <main>
  <Routes>
    <Route path ='/' element={<HomePage/>}/>
    <Route path ='/signup' element={<Signup/>}/>
    <Route path ='/about' element={<AboutPage/>}/>
    <Route path ='/product' element={<ProductPage/>} />
    <Route path ='/pricing' element={<PricingPage/>} />
    <Route path ='/support' element={<SupportPage/>} />
    <Route path='/login' element={<Login/>} />
    <Route path ='*' element={<NotFound/>} />
  </Routes>
  </main>
  <Footer/>
  </BrowserRouter>
);
