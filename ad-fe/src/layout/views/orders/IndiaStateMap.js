import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Chart } from "react-google-charts";
import { Input } from "../../../components/ui/input";
import {
  MagnifyingGlass as SearchIcon,
  Globe as PublicIcon,
  TrendUp as TrendingUpIcon,
  MapPin as LocationOnIcon,
  ArrowLeft as ArrowBackIcon
} from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import moment from "moment";
import { ApiGetStateWiseOrderCount } from "../../../api-wrapper/orders/ApiOrders";
import { AppTooltip } from "../../../components/ui/AppTooltip";

const P = {
  primary: "#1A9FD4",
  primary50: "#E0F4FD",
  neutral100: "#F1F5F9",
  neutral200: "#E2E8F0",
  neutral400: "#94A3B8",
  neutral600: "#475569",
  neutral800: "#1E293B",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#E74C3C",
};

// Mapping of state names from the API/postal-service to Google GeoChart region names
const STATE_NAME_MAP = {
  "Andaman And Nicobar Islands": "Andaman and Nicobar Islands",
  "Andhra Pradesh": "Andhra Pradesh",
  "Arunachal Pradesh": "Arunachal Pradesh",
  "Assam": "Assam",
  "Bihar": "Bihar",
  "Chandigarh": "Chandigarh",
  "Chhattisgarh": "Chhattisgarh",
  "Dadra And Nagar Haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "Dadra And Nagar Haveli And Daman And Diu": "Dadra and Nagar Haveli and Daman and Diu",
  "Daman And Diu": "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi": "Delhi",
  "Goa": "Goa",
  "Gujarat": "Gujarat",
  "Haryana": "Haryana",
  "Himachal Pradesh": "Himachal Pradesh",
  "Jammu And Kashmir": "Jammu and Kashmir",
  "Jammu & Kashmir": "Jammu and Kashmir",
  "Jharkhand": "Jharkhand",
  "Karnataka": "Karnataka",
  "Kerala": "Kerala",
  "Ladakh": "Ladakh",
  "Lakshadweep": "Lakshadweep",
  "Madhya Pradesh": "Madhya Pradesh",
  "Maharashtra": "Maharashtra",
  "Manipur": "Manipur",
  "Meghalaya": "Meghalaya",
  "Mizoram": "Mizoram",
  "Nagaland": "Nagaland",
  "Odisha": "Odisha",
  "Puducherry": "Puducherry",
  "Punjab": "Punjab",
  "Rajasthan": "Rajasthan",
  "Sikkim": "Sikkim",
  "Tamil Nadu": "Tamil Nadu",
  "Telangana": "Telangana",
  "Tripura": "Tripura",
  "Uttar Pradesh": "Uttar Pradesh",
  "Uttarakhand": "Uttarakhand",
  "West Bengal": "West Bengal",
};

// ISO 3166-2:IN codes for Google GeoCharts state maps
const STATE_ISO_MAP = {
  "Andaman and Nicobar Islands": "IN-AN",
  "Andaman And Nicobar Islands": "IN-AN",
  "Andhra Pradesh": "IN-AP",
  "Arunachal Pradesh": "IN-AR",
  "Assam": "IN-AS",
  "Bihar": "IN-BR",
  "Chandigarh": "IN-CH",
  "Chhattisgarh": "IN-CT",
  "Dadra and Nagar Haveli and Daman and Diu": "IN-DH",
  "Dadra And Nagar Haveli And Daman And Diu": "IN-DH",
  "Dadra And Nagar Haveli": "IN-DH",
  "Daman And Diu": "IN-DH",
  "Delhi": "IN-DL",
  "Goa": "IN-GA",
  "Gujarat": "IN-GJ",
  "Haryana": "IN-HR",
  "Himachal Pradesh": "IN-HP",
  "Jammu and Kashmir": "IN-JK",
  "Jammu And Kashmir": "IN-JK",
  "Jammu & Kashmir": "IN-JK",
  "Jharkhand": "IN-JH",
  "Karnataka": "IN-KA",
  "Kerala": "IN-KL",
  "Ladakh": "IN-LA",
  "Lakshadweep": "IN-LD",
  "Madhya Pradesh": "IN-MP",
  "Maharashtra": "IN-MH",
  "Manipur": "IN-MN",
  "Meghalaya": "IN-ML",
  "Mizoram": "IN-MZ",
  "Nagaland": "IN-NL",
  "Odisha": "IN-OR",
  "Puducherry": "IN-PY",
  "Punjab": "IN-PB",
  "Rajasthan": "IN-RJ",
  "Sikkim": "IN-SK",
  "Tamil Nadu": "IN-TN",
  "Telangana": "IN-TG",
  "Tripura": "IN-TR",
  "Uttar Pradesh": "IN-UP",
  "Uttarakhand": "IN-UT",
  "West Bengal": "IN-WB",
};


// Center percentages (x, y) and zoom scales for Indian states on the Google GeoChart India map
const STATE_ZOOM_MAP = {
  "Andaman and Nicobar Islands": { x: 80, y: 85, scale: 3.2 },
  "Andaman And Nicobar Islands": { x: 80, y: 85, scale: 3.2 },
  "Andhra Pradesh": { x: 48, y: 68, scale: 2.5 },
  "Arunachal Pradesh": { x: 86, y: 28, scale: 3.0 },
  "Assam": { x: 80, y: 32, scale: 3.0 },
  "Bihar": { x: 62, y: 36, scale: 3.0 },
  "Chandigarh": { x: 38, y: 24, scale: 3.2 },
  "Chhattisgarh": { x: 55, y: 50, scale: 2.5 },
  "Dadra and Nagar Haveli and Daman and Diu": { x: 28, y: 52, scale: 3.5 },
  "Dadra And Nagar Haveli And Daman And Diu": { x: 28, y: 52, scale: 3.5 },
  "Dadra And Nagar Haveli": { x: 28, y: 52, scale: 3.5 },
  "Daman And Diu": { x: 28, y: 52, scale: 3.5 },
  "Delhi": { x: 39, y: 27, scale: 3.5 },
  "Goa": { x: 32, y: 68, scale: 3.5 },
  "Gujarat": { x: 26, y: 46, scale: 2.5 },
  "Haryana": { x: 37, y: 27, scale: 3.0 },
  "Himachal Pradesh": { x: 41, y: 19, scale: 3.0 },
  "Jammu and Kashmir": { x: 38, y: 12, scale: 3.0 },
  "Jammu And Kashmir": { x: 38, y: 12, scale: 3.0 },
  "Jammu & Kashmir": { x: 38, y: 12, scale: 3.0 },
  "Jharkhand": { x: 63, y: 42, scale: 3.0 },
  "Karnataka": { x: 36, y: 72, scale: 2.5 },
  "Kerala": { x: 39, y: 84, scale: 3.0 },
  "Ladakh": { x: 44, y: 10, scale: 3.0 },
  "Lakshadweep": { x: 28, y: 88, scale: 3.5 },
  "Madhya Pradesh": { x: 45, y: 47, scale: 2.2 },
  "Maharashtra": { x: 38, y: 56, scale: 2.5 },
  "Manipur": { x: 86, y: 36, scale: 3.5 },
  "Meghalaya": { x: 78, y: 34, scale: 3.5 },
  "Mizoram": { x: 85, y: 40, scale: 3.5 },
  "Nagaland": { x: 88, y: 32, scale: 3.5 },
  "Odisha": { x: 59, y: 52, scale: 2.5 },
  "Puducherry": { x: 47, y: 79, scale: 3.5 },
  "Punjab": { x: 35, y: 22, scale: 3.0 },
  "Rajasthan": { x: 29, y: 34, scale: 2.2 },
  "Sikkim": { x: 69, y: 30, scale: 3.5 },
  "Tamil Nadu": { x: 44, y: 80, scale: 2.5 },
  "Telangana": { x: 46, y: 62, scale: 2.5 },
  "Tripura": { x: 82, y: 38, scale: 3.5 },
  "Uttar Pradesh": { x: 50, y: 34, scale: 2.2 },
  "Uttarakhand": { x: 45, y: 24, scale: 3.0 },
  "West Bengal": { x: 68, y: 43, scale: 2.5 },
};

// Bounding box centers and zoom factors for Leaflet state maps
const STATE_CENTERS = {
  "Andaman and Nicobar Islands": { lat: 11.7401, lng: 92.6586, zoom: 7 },
  "Andaman And Nicobar Islands": { lat: 11.7401, lng: 92.6586, zoom: 7 },
  "Andhra Pradesh": { lat: 15.9129, lng: 79.7400, zoom: 7 },
  "Arunachal Pradesh": { lat: 28.2180, lng: 94.7278, zoom: 7 },
  "Assam": { lat: 26.2006, lng: 92.9376, zoom: 7 },
  "Bihar": { lat: 25.0961, lng: 85.3131, zoom: 7 },
  "Chandigarh": { lat: 30.7333, lng: 76.7794, zoom: 11 },
  "Chhattisgarh": { lat: 21.2787, lng: 81.8661, zoom: 7 },
  "Dadra and Nagar Haveli and Daman and Diu": { lat: 20.1809, lng: 73.0169, zoom: 9 },
  "Dadra And Nagar Haveli And Daman And Diu": { lat: 20.1809, lng: 73.0169, zoom: 9 },
  "Dadra And Nagar Haveli": { lat: 20.1809, lng: 73.0169, zoom: 9 },
  "Delhi": { lat: 28.7041, lng: 77.1025, zoom: 10 },
  "Goa": { lat: 15.2993, lng: 74.1240, zoom: 9 },
  "Gujarat": { lat: 22.2587, lng: 71.1924, zoom: 7 },
  "Haryana": { lat: 29.0588, lng: 76.0856, zoom: 7 },
  "Himachal Pradesh": { lat: 31.1048, lng: 77.1734, zoom: 7 },
  "Jammu and Kashmir": { lat: 33.7782, lng: 76.5762, zoom: 7 },
  "Jammu And Kashmir": { lat: 33.7782, lng: 76.5762, zoom: 7 },
  "Jammu & Kashmir": { lat: 33.7782, lng: 76.5762, zoom: 7 },
  "Jharkhand": { lat: 23.6102, lng: 85.2799, zoom: 7 },
  "Karnataka": { lat: 15.3173, lng: 75.7139, zoom: 7 },
  "Kerala": { lat: 10.8505, lng: 76.2711, zoom: 7 },
  "Ladakh": { lat: 34.1526, lng: 77.5771, zoom: 7 },
  "Lakshadweep": { lat: 10.5667, lng: 72.6417, zoom: 8 },
  "Madhya Pradesh": { lat: 23.4733, lng: 77.9478, zoom: 7 },
  "Maharashtra": { lat: 19.7515, lng: 75.7139, zoom: 7 },
  "Manipur": { lat: 24.6637, lng: 93.9063, zoom: 8 },
  "Meghalaya": { lat: 25.4670, lng: 91.3662, zoom: 8 },
  "Mizoram": { lat: 23.1645, lng: 92.9376, zoom: 8 },
  "Nagaland": { lat: 26.1584, lng: 94.5624, zoom: 8 },
  "Odisha": { lat: 20.9517, lng: 85.0985, zoom: 7 },
  "Puducherry": { lat: 11.9416, lng: 79.8083, zoom: 9 },
  "Punjab": { lat: 31.1471, lng: 75.3412, zoom: 7 },
  "Rajasthan": { lat: 27.0238, lng: 74.2179, zoom: 7 },
  "Sikkim": { lat: 27.5330, lng: 88.5122, zoom: 8 },
  "Tamil Nadu": { lat: 11.1271, lng: 78.6569, zoom: 7 },
  "Telangana": { lat: 18.1124, lng: 79.0193, zoom: 7 },
  "Tripura": { lat: 23.9408, lng: 91.9882, zoom: 8 },
  "Uttar Pradesh": { lat: 26.8467, lng: 80.9462, zoom: 7 },
  "Uttarakhand": { lat: 30.0668, lng: 79.0193, zoom: 7 },
  "West Bengal": { lat: 22.9868, lng: 87.8550, zoom: 7 },
};


// Latitude & Longitude coordinates lookup database for Indian cities/districts
const CITY_LAT_LNG = {
  // Madhya Pradesh
  "bhopal": { lat: 23.2599, lng: 77.4126 },
  "indore": { lat: 22.7196, lng: 75.8577 },
  "jabalpur": { lat: 23.1815, lng: 79.9864 },
  "gwalior": { lat: 26.2183, lng: 78.1828 },
  "ujjain": { lat: 23.1760, lng: 75.7885 },
  "sagar": { lat: 23.8388, lng: 78.7378 },
  "satna": { lat: 24.6005, lng: 80.8322 },
  "rewa": { lat: 24.5362, lng: 81.3038 },
  "ratlam": { lat: 23.3315, lng: 75.0367 },
  "singrauli": { lat: 24.1957, lng: 82.6687 },
  "dewas": { lat: 22.9622, lng: 76.0507 },
  "dhar": { lat: 22.5905, lng: 75.3036 },
  "chhindwara": { lat: 22.0574, lng: 78.9382 },

  // Bihar
  "sitamarhi": { lat: 26.5986, lng: 85.4954 },
  "purnea": { lat: 25.7771, lng: 87.4753 },
  "kishanganj": { lat: 26.0739, lng: 87.9383 },
  "darbhanga": { lat: 26.1542, lng: 85.8918 },
  "nalanda": { lat: 25.1207, lng: 85.3647 },
  "begusarai": { lat: 25.4184, lng: 86.1274 },
  "madhubani": { lat: 26.3486, lng: 86.0827 },

  // Maharashtra
  "mumbai": { lat: 19.0760, lng: 72.8777 },
  "pune": { lat: 18.5204, lng: 73.8567 },
  "nagpur": { lat: 21.1458, lng: 79.0882 },
  "thane": { lat: 19.2183, lng: 72.9781 },
  "nashik": { lat: 19.9975, lng: 73.7898 },
  "aurangabad": { lat: 19.8762, lng: 75.3433 },
  "solapur": { lat: 17.6599, lng: 75.9064 },
  "kolhapur": { lat: 16.7050, lng: 74.2433 },
  "amravati": { lat: 20.9320, lng: 77.7523 },
  "jalgaon": { lat: 21.0077, lng: 75.5626 },
  "navi mumbai": { lat: 19.0330, lng: 73.0297 },
  "ahmednagar": { lat: 19.0948, lng: 74.7480 },
  "akola": { lat: 20.7002, lng: 77.0082 },
  "latur": { lat: 18.4088, lng: 76.5604 },
  "dhule": { lat: 20.9042, lng: 74.7749 },
  "nanded": { lat: 19.1383, lng: 77.3210 },
  "satara": { lat: 17.6805, lng: 73.9918 },

  // Karnataka
  "bangalore": { lat: 12.9716, lng: 77.5946 },
  "mysore": { lat: 12.2958, lng: 76.6394 },
  "belgaum": { lat: 15.8497, lng: 74.4977 },
  "hubli": { lat: 15.3647, lng: 75.1240 },
  "dharwad": { lat: 15.3647, lng: 75.1240 },
  "mangalore": { lat: 12.9141, lng: 74.8560 },
  "dakshina kannada": { lat: 12.9141, lng: 74.8560 },
  "gulbarga": { lat: 17.3297, lng: 76.8343 },
  "davangere": { lat: 14.4644, lng: 75.9218 },
  "bellary": { lat: 15.1394, lng: 76.9214 },
  "shimoga": { lat: 13.9299, lng: 75.5681 },
  "tumkur": { lat: 13.3392, lng: 77.1140 },

  // Tamil Nadu
  "chennai city north": { lat: 13.12, lng: 80.28 },
  "chennai city south": { lat: 13.04, lng: 80.26 },
  "chennai city central": { lat: 13.08, lng: 80.27 },
  "chennai": { lat: 13.08, lng: 80.27 },
  "tambaram": { lat: 12.92, lng: 80.12 },
  "kanchipuram": { lat: 12.83, lng: 79.70 },
  "tuticorin": { lat: 8.80, lng: 78.15 },
  "thoothukudi": { lat: 8.80, lng: 78.15 },
  "kanniyakumari": { lat: 8.08, lng: 77.54 },
  "cuddalore": { lat: 11.75, lng: 79.77 },
  "chengalpattu": { lat: 12.68, lng: 79.98 },
  "tiruchirappalli": { lat: 10.79, lng: 78.70 },
  "trichy": { lat: 10.79, lng: 78.70 },
  "coimbatore": { lat: 11.01, lng: 76.96 },
  "madurai": { lat: 9.93, lng: 78.12 },
  "salem": { lat: 11.66, lng: 78.14 },
  "vellore": { lat: 12.92, lng: 79.13 },
  "tiruppur": { lat: 11.11, lng: 77.34 },
  "erode": { lat: 11.34, lng: 77.72 },
  "tirunelveli": { lat: 8.71, lng: 77.76 },
  "thanjavur": { lat: 10.79, lng: 79.13 },
  "dharmapuri": { lat: 12.13, lng: 78.16 },
  "dindigul": { lat: 10.37, lng: 77.96 },
  "krishnagiri": { lat: 12.52, lng: 78.22 },
  "namakkal": { lat: 11.23, lng: 78.16 },
  "pudukkottai": { lat: 10.38, lng: 78.82 },
  "ramanathapuram": { lat: 9.37, lng: 78.83 },
  "sivaganga": { lat: 9.85, lng: 78.48 },
  "theni": { lat: 10.01, lng: 77.47 },
  "tiruvallur": { lat: 13.15, lng: 79.91 },
  "tiruvannamalai": { lat: 12.23, lng: 79.07 },
  "tiruvarur": { lat: 10.77, lng: 79.63 },
  "viluppuram": { lat: 11.94, lng: 79.49 },
  "virudhunagar": { lat: 9.58, lng: 77.96 },
  "karur": { lat: 10.96, lng: 78.08 },
  "nilgiris": { lat: 11.40, lng: 76.70 },
  "perambalur": { lat: 11.24, lng: 78.88 },
  "ariyalur": { lat: 11.14, lng: 79.08 },

  // Uttar Pradesh
  "noida": { lat: 28.5355, lng: 77.3910 },
  "ghaziabad": { lat: 28.6692, lng: 77.4538 },
  "lucknow": { lat: 26.8467, lng: 80.9462 },
  "kanpur": { lat: 26.4499, lng: 80.3319 },
  "varanasi": { lat: 25.3176, lng: 82.9739 },
  "agra": { lat: 27.1767, lng: 78.0081 },
  "meerut": { lat: 28.9845, lng: 77.7064 },
  "allahabad": { lat: 25.4358, lng: 81.8463 },
  "prayagraj": { lat: 25.4358, lng: 81.8463 },
  "bareilly": { lat: 28.3670, lng: 79.4304 },
  "aligarh": { lat: 27.8974, lng: 78.0880 },
  "moradabad": { lat: 28.8386, lng: 78.7733 },
  "gorakhpur": { lat: 26.7606, lng: 83.3731 },

  // Gujarat
  "ahmedabad": { lat: 23.0225, lng: 72.5714 },
  "surat": { lat: 21.1702, lng: 72.8311 },
  "vadodara": { lat: 22.3072, lng: 73.1812 },
  "rajkot": { lat: 22.3039, lng: 70.8022 },
  "bhavnagar": { lat: 21.7645, lng: 72.1519 },
  "jamnagar": { lat: 22.4707, lng: 70.0577 },
  "junagadh": { lat: 21.5222, lng: 70.4579 },
  "gandhinagar": { lat: 23.2156, lng: 72.6369 },

  // West Bengal
  "kolkata": { lat: 22.5726, lng: 88.3639 },
  "howrah": { lat: 22.5785, lng: 88.3103 },
  "darjeeling": { lat: 27.0410, lng: 88.2627 },
  "asansol": { lat: 23.6740, lng: 86.9730 },
  "durgapur": { lat: 23.5204, lng: 87.3119 },
  "siliguri": { lat: 26.7271, lng: 88.3953 },
  "kharagpur": { lat: 22.3302, lng: 87.3237 },

  // Delhi
  "delhi": { lat: 28.6139, lng: 77.2090 },

  // Rajasthan
  "jaipur": { lat: 26.9124, lng: 75.7873 },
  "jodhpur": { lat: 26.2389, lng: 73.0243 },
  "udaipur": { lat: 24.5854, lng: 73.7125 },
  "bikaner": { lat: 28.0229, lng: 73.3119 },
  "kota": { lat: 25.2138, lng: 75.8648 },
  "ajmer": { lat: 26.4498, lng: 74.6399 },
  "alwar": { lat: 27.5530, lng: 76.6089 },
  "bhilwara": { lat: 25.3407, lng: 74.6409 },

  // Andhra Pradesh
  "visakhapatnam": { lat: 17.6868, lng: 83.2185 },
  "vijayawada": { lat: 16.5062, lng: 80.6480 },
  "guntur": { lat: 16.3067, lng: 80.4365 },
  "nellore": { lat: 14.4426, lng: 79.9865 },
  "kurnool": { lat: 15.8281, lng: 78.0373 },
  "tirupati": { lat: 13.6288, lng: 79.4192 },
  "kakinada": { lat: 16.9891, lng: 82.2475 },

  // Telangana
  "hyderabad": { lat: 17.3850, lng: 78.4867 },
  "warangal": { lat: 17.9689, lng: 79.5941 },
  "nizamabad": { lat: 18.6725, lng: 78.0941 },
  "khammam": { lat: 17.2473, lng: 80.1514 },

  // Kerala
  "kochi": { lat: 9.9312, lng: 76.2673 },
  "thiruvananthapuram": { lat: 8.5241, lng: 76.9366 },
  "kozhikode": { lat: 11.2588, lng: 75.7804 },
  "thrissur": { lat: 10.5276, lng: 76.2144 },
  "kollam": { lat: 8.8932, lng: 76.6141 },

  // Punjab
  "amritsar": { lat: 31.6340, lng: 74.8723 },
  "ludhiana": { lat: 30.9010, lng: 75.8573 },
  "jalandhar": { lat: 31.3260, lng: 75.5762 },
  "patiala": { lat: 30.3398, lng: 76.3869 },

  // Haryana
  "gurugram": { lat: 28.4595, lng: 77.0266 },
  "gurgaon": { lat: 28.4595, lng: 77.0266 },
  "faridabad": { lat: 28.4089, lng: 77.3178 },
  "panipat": { lat: 29.3909, lng: 76.9635 },
  "ambala": { lat: 30.3782, lng: 76.7767 },
};

const getCityLatLng = (cityName, stateName, index) => {
  const key = cityName.toLowerCase()
    .replace(/city/g, "")
    .replace(/district/g, "")
    .trim();
  if (CITY_LAT_LNG[key]) {
    return CITY_LAT_LNG[key];
  }
  // Fallback to state center from STATE_CENTERS
  const center = STATE_CENTERS[stateName] || { lat: 20.5937, lng: 78.9629 };
  const angle = (index * 2 * Math.PI) / 8;
  const radius = 0.3 + 0.1 * Math.floor(index / 8);
  return {
    lat: center.lat + radius * Math.sin(angle),
    lng: center.lng + radius * Math.cos(angle),
  };
};




const normalizeStateName = (name) => {
  if (!name) return name;
  const trimmed = name.trim();
  return STATE_NAME_MAP[trimmed] || trimmed;
};

const AnimatedCounter = ({ value, duration = 1200 }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    let start = 0;
    const step = Math.max(1, Math.floor(value / (duration / 16)));
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setDisplay(value); clearInterval(timer); }
      else setDisplay(start);
    }, 16);
    return () => clearInterval(timer);
  }, [value, duration]);
  return <>{display.toLocaleString("en-IN")}</>;
};

// Gradient colors for the district/city cards
const CARD_GRADIENTS = [
  "linear-gradient(135deg, #1A9FD4 0%, #1a6fc4 100%)",
  "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
  "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
  "linear-gradient(135deg, #be185d 0%, #f472b6 100%)",
  "linear-gradient(135deg, #1d4ed8 0%, #60a5fa 100%)",
];

const CircularProgressRing = ({ value, maxValue, color = P.primary }) => {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  const radius = 8;
  const strokeWidth = 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.max(4, Math.min(100, pct)) / 100) * circumference;

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20 }}>
      <svg width="20" height="20" style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="transparent"
          stroke="rgba(2, 70, 139, 0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease-in-out" }}
        />
      </svg>
    </div>
  );
};

const EnhancedTooltip = ({ title, children, placement = "top", style = {} }) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = React.useRef(null);

  const show = useCallback(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      if (placement === "left") {
        setPos({
          top: r.top + r.height / 2,
          left: r.left - 8,
        });
      } else { // top fallback
        setPos({
          top: r.top - 8,
          left: r.left + r.width / 2,
        });
      }
    }
    setVisible(true);
  }, [placement]);

  const hide = useCallback(() => setVisible(false), []);

  const tooltipStyles = {
    position: "fixed",
    top: pos.top,
    left: pos.left,
    zIndex: 99999,
    pointerEvents: "none",
    whiteSpace: "nowrap",
    background: "linear-gradient(135deg, #1A9FD4 0%, #2374F2 100%)",
    color: "#fff",
    fontSize: "11px",
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: "6px",
    boxShadow: "0 4px 14px rgba(2, 70, 139, 0.3)",
    border: "1px solid rgba(255, 255, 255, 0.15)",
  };

  const arrowStyles = {
    position: "absolute",
    width: 0,
    height: 0,
    borderStyle: "solid",
  };

  if (placement === "left") {
    tooltipStyles.transform = "translate(-100%, -50%)";
    arrowStyles.top = "50%";
    arrowStyles.right = "-5px";
    arrowStyles.transform = "translateY(-50%)";
    arrowStyles.borderWidth = "5px 0 5px 5px";
    arrowStyles.borderColor = "transparent transparent transparent #2374F2";
  } else { // top
    tooltipStyles.transform = "translate(-50%, -100%)";
    arrowStyles.bottom = "-5px";
    arrowStyles.left = "50%";
    arrowStyles.transform = "translateX(-50%)";
    arrowStyles.borderWidth = "5px 5px 0 5px";
    arrowStyles.borderColor = "#2374F2 transparent transparent transparent";
  }

  return (
    <>
      <div className="flex"
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={hide}
        style={{ width: "100%", ...style }}
      >
        {children}
      </div>
      {visible && title &&
        createPortal(
          <div style={tooltipStyles}>
            {title}
            <div style={arrowStyles} />
          </div>,
          document.body
        )}
    </>
  );
};



const IndiaStateMap = ({ profileId, orderDateRange, isMobile }) => {
  const { t } = useTranslation();


  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [mapData, setMapData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Drill-down state
  const [drillState, setDrillState] = useState(null); // null = map view, string = state name
  const [drillData, setDrillData] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillSearch, setDrillSearch] = useState("");
  const [hoveredNode, setHoveredNode] = useState(null);

  const mapRef = React.useRef(null);

  // Fetch state-level data
  const fetchStateData = useCallback(async () => {
    if (!profileId?.value) return;
    setLoading(true);
    try {
      const payload = {
        profileId: profileId.value,
        fromDate: orderDateRange?.[0] ? moment(orderDateRange[0]).format("YYYY-MM-DD") : undefined,
        toDate: orderDateRange?.[1] ? moment(orderDateRange[1]).format("YYYY-MM-DD") : undefined,
      };
      const res = await ApiGetStateWiseOrderCount(payload);
      if (res?.isSuccess) {
        setMapData(res.data || []);
      }
    } catch (err) {
      console.error("State-wise fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [profileId?.value, orderDateRange]);

  useEffect(() => {
    fetchStateData();
  }, [fetchStateData]);

  // Aggregate by state for the map
  const stateAggregated = useMemo(() => {
    const stateMap = {};
    mapData.forEach((item) => {
      const key = normalizeStateName(item.state);
      if (!key || key === "Unknown") return;
      if (!stateMap[key]) stateMap[key] = { state: key, order: 0, districts: [] };
      stateMap[key].order += item.order;
      stateMap[key].districts.push({ district: item.district, city: item.city, order: item.order });
    });
    return Object.values(stateMap).sort((a, b) => b.order - a.order);
  }, [mapData]);

  const totalOrders = useMemo(() => stateAggregated.reduce((s, v) => s + v.order, 0), [stateAggregated]);
  const totalStates = stateAggregated.length;
  const topState = stateAggregated[0];

  // GeoChart data (National map)
  const chartData = useMemo(() => {
    if (stateAggregated.length === 0) return [["State", "Orders"]];
    return [
      ["State", "Orders"],
      ...stateAggregated.map((s) => [s.state, s.order]),
    ];
  }, [stateAggregated]);

  const chartOptions = useMemo(() => ({
    region: "IN",
    resolution: "provinces",
    colorAxis: {
      colors: isDark
        ? ["#0e1626", "#1a2c4c", "#2b4c7e", "#2374F2", "#60A5FA"]
        : ["#E0F4FD", "#93B8E8", "#2374F2", "#1A9FD4", "#012D5A"],
      minValue: 0,
    },
    backgroundColor: "transparent",
    datalessRegionColor: isDark ? "#161b26" : "#f1f5f9",
    defaultColor: isDark ? "#161b26" : "#f1f5f9",
    tooltip: {
      textStyle: { fontName: "Inter", fontSize: 13 },
      showColorCode: true,
    },
    legend: "none",
    keepAspectRatio: true,
  }), [isDark]);

  // Handle state click on map
  const handleChartSelect = useCallback(
    (args) => {
      if (!args || !args.chartWrapper) return;
      const { chartWrapper } = args;
      const chart = chartWrapper.getChart();
      if (!chart || typeof chart.getSelection !== "function") return;
      const selection = chart.getSelection();
      if (!selection || selection.length === 0) return;
      const row = selection[0].row;
      if (row == null) return;
      const stateName = chartData[row + 1]?.[0];
      if (!stateName) return;
      openStateDrill(stateName);
    },
    [chartData]
  );

  const openStateDrill = async (stateName) => {
    setDrillState(stateName);
    setDrillSearch("");
    setDrillLoading(true);

    try {
      const payload = {
        profileId: profileId.value,
        fromDate: orderDateRange?.[0] ? moment(orderDateRange[0]).format("YYYY-MM-DD") : undefined,
        toDate: orderDateRange?.[1] ? moment(orderDateRange[1]).format("YYYY-MM-DD") : undefined,
        state: stateName,
      };
      const res = await ApiGetStateWiseOrderCount(payload);
      if (res?.isSuccess) {
        setDrillData(res.data || []);
      }
    } catch (err) {
      console.error("Drill-down fetch error:", err);
    } finally {
      setDrillLoading(false);
    }
  };

  const goBackToMap = () => {
    setDrillState(null);
    setDrillData([]);
    setDrillSearch("");
  };

  // Filter drill data
  const filteredDrill = useMemo(() => {
    if (!drillData.length) return [];
    let list = drillData;
    if (drillSearch.trim()) {
      const q = drillSearch.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.city?.toLowerCase().includes(q) ||
          d.district?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [drillData, drillSearch]);

  const drillMaxOrder = useMemo(() => Math.max(1, ...filteredDrill.map((d) => d.order)), [filteredDrill]);
  const drillTotalOrders = useMemo(() => filteredDrill.reduce((s, d) => s + d.order, 0), [filteredDrill]);

  // GeoChart data for state drill down
  const drillChartData = useMemo(() => {
    if (filteredDrill.length === 0) return [["Lat", "Long", "Name", "Orders"]];
    return [
      ["Lat", "Long", "Name", "Orders"],
      ...filteredDrill.map((d, idx) => {
        const name = d.city || d.district || "";
        const { lat, lng } = getCityLatLng(name, drillState, idx);
        return [lat, lng, `${name} (${d.order})`, d.order];
      }),
    ];
  }, [filteredDrill, drillState]);

  // Cleanup Leaflet map on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Initialize and update Leaflet map for drill down view
  useEffect(() => {
    if (!drillState || drillLoading) return;

    const timer = setTimeout(() => {
      const containerId = "leaflet-state-map";
      const container = document.getElementById(containerId);
      if (!container) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const L = window.L;
      if (!L) {
        console.error("Leaflet library is not available");
        return;
      }

      const centerConfig = STATE_CENTERS[drillState] || { lat: 20.5937, lng: 78.9629, zoom: 6 };

      const map = L.map(containerId, {
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        attributionControl: false
      }).setView([centerConfig.lat, centerConfig.lng], centerConfig.zoom);

      mapRef.current = map;

      // Beautiful clean tiles
      const tilesUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

      L.tileLayer(tilesUrl, {
        maxZoom: 20,
      }).addTo(map);

      // Render city/district markers
      filteredDrill.forEach((d, idx) => {
        const name = d.city || d.district || "";
        const { lat, lng } = getCityLatLng(name, drillState, idx);

        const iconHtml = `
          <div class="custom-leaflet-marker" style="display: flex; align-items: center; gap: 8px; white-space: nowrap;">
            <div class="marker-pulse" style="
              width: 12px;
              height: 12px;
              background-color: ${P.primary};
              border: 2px solid white;
              border-radius: 50%;
              box-shadow: 0 0 6px rgba(2, 70, 139, 0.6);
              flex-shrink: 0;
            "></div>
            <div style="
              font-family: 'Inter', sans-serif;
              font-size: 10px;
              font-weight: 700;
              color: ${isDark ? '#cbd5e1' : P.neutral800};
              background: ${isDark ? '#161b26' : 'rgba(255, 255, 255, 0.95)'};
              padding: 3px 8px;
              border-radius: 6px;
              border: 1px solid ${isDark ? 'rgba(255,255,255,0.12)' : P.neutral200};
              box-shadow: 0 2px 4px rgba(0,0,0,0.08);
              pointer-events: auto;
            ">${name} <span style="color: ${isDark ? '#2374F2' : P.primary}; font-weight: 800;">(${d.order})</span></div>
          </div>
        `;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: "clean-map-marker",
          iconSize: [150, 24],
          iconAnchor: [6, 12]
        });

        const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
        marker.on("click", () => {
          setDrillSearch(name);
        });
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [drillState, drillLoading, filteredDrill, isDark]);

  // Top 10 sidebar
  const top10 = stateAggregated.slice(0, 10);
  const maxOrder = top10.length > 0 ? top10[0].order : 1;

  // ════════════════════════════════════════════════
  // DRILL-DOWN VIEW — Outlined Vector Map
  // ════════════════════════════════════════════════
  if (drillState) {
    return (
      <div className="ism-drill-view" style={{ marginBottom: 0 }}>
        {/* Drill Header */}
        <div className="ism-drill-header">
          <div className="flex items-center gap-3">
            <button className="ism-back-btn" onClick={goBackToMap}>
              <ArrowBackIcon style={{ fontSize: 18 }} />
            </button>
            <div>
              <div className="ism-drill-header__title">
                <LocationOnIcon style={{ fontSize: 18, color: P.primary }} />
                {drillState}
              </div>
              <div className="ism-drill-header__sub">
                {t("Geographic breakdown of orders in")} {drillState}
              </div>
            </div>
          </div>
          <div className="ism-drill-header__stats">
            <div className="ism-drill-mini-stat">
              <span className="ism-drill-mini-stat__val" style={{ color: P.primary }}>
                {drillTotalOrders.toLocaleString("en-IN")}
              </span>
              <span className="ism-drill-mini-stat__label">{t("Orders")}</span>
            </div>
            <div className="ism-drill-mini-stat">
              <span className="ism-drill-mini-stat__val" style={{ color: P.success }}>
                {filteredDrill.length}
              </span>
              <span className="ism-drill-mini-stat__label">{t("Locations")}</span>
            </div>
          </div>
        </div>

        {drillLoading ? (
          <div className="india-map-loading flex flex-col items-center justify-center" style={{ height: isMobile ? "380px" : "520px" }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A9FD4]"></div>
            <span style={{ fontSize: 12, color: P.neutral400, marginTop: 12 }}>
              {t("Loading district map data...")}
            </span>
          </div>
        ) : (
          <div className="ism-drill-body" style={{ padding: "0 16px 16px" }}>
            <div className="india-map-content">
              {/* Sleek, zoomable Leaflet Map for state drill down */}
              <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
                <div
                  id="leaflet-state-map"
                  style={{
                    height: isMobile ? "380px" : "520px",
                    width: "100%",
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : P.neutral200}`,
                    zIndex: 1
                  }}
                />
              </div>

              {/* Sidebar: District/City Search and list */}
              <div className="india-map-sidebar" style={{ width: isMobile ? "100%" : "300px" }}>
                <div className="india-map-sidebar__header" style={{ padding: "12px" }}>
                  <div className="flex w-full items-center border rounded-lg px-2" style={{
                    height: 32,
                    background: isDark ? "#161b26" : "#fff",
                    borderColor: isDark ? "rgba(255,255,255,0.12)" : "#e2e8f0"
                  }}>
                    <Input
                      placeholder={t("Search location...")}
                      value={drillSearch}
                      onChange={(e) => setDrillSearch(e.target.value)}
                      className="border-0 shadow-none focus-visible:ring-0 p-0 h-full bg-transparent"
                      style={{ fontSize: 12, color: isDark ? "#cbd5e1" : "#000" }}
                    />
                  </div>
                </div>
                <div className="india-map-sidebar__list" style={{ maxHeight: isMobile ? "280px" : "450px" }}>
                  {filteredDrill.length > 0 ? (
                    filteredDrill.map((d, idx) => {
                      const barPct = Math.max(4, (d.order / drillMaxOrder) * 100);
                      const gradient = CARD_GRADIENTS[idx % CARD_GRADIENTS.length];
                      return (
                        <div
                          key={`${d.city}-${d.district}-${idx}`}
                          className="india-map-rank-item"
                          onClick={() => setDrillSearch(d.city || d.district)}
                        >
                          <div className="india-map-rank-item__header" style={{ width: "100%" }}>
                            <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
                              <span className={`india-map-rank-badge rank-${idx === 0 ? "1" : idx === 1 ? "2" : idx === 2 ? "3" : "other"}`}>
                                {idx + 1}
                              </span>
                              <div className="flex flex-col" style={{ minWidth: 0 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#cbd5e1" : P.neutral800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {d.city || d.district}
                                </span>
                                {d.city && d.district && d.city !== d.district && (
                                  <span style={{ fontSize: 9, color: isDark ? "#94a3b8" : P.neutral400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {d.district}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2" style={{ flexShrink: 0, marginLeft: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#2374F2" : P.primary }}>
                                {d.order.toLocaleString("en-IN")}
                              </span>
                              <CircularProgressRing value={d.order} maxValue={drillMaxOrder} />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ textAlign: "center", padding: "32px 0", color: P.neutral400, fontSize: 12 }}>
                      {t("No locations found.")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
        }
      </div >
    );
  }

  // ════════════════════════════════════════════════
  // MAP VIEW — Default India overview
  // ════════════════════════════════════════════════
  return (
    <div className="india-map-section" style={{ marginBottom: 0 }}>
      {/* Body */}
      <div className="india-map-body relative">
        {/* Overlay Loader */}
        {loading && (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-[16px] pointer-events-auto"
            style={{
              background: isDark ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.7)",
              backdropFilter: "blur(2px)",
            }}
          >
            <div
              className="flex flex-col items-center justify-center gap-2 p-4 shadow-lg"
              style={{
                background: isDark ? "rgba(30, 41, 59, 0.9)" : "rgba(255, 255, 255, 0.9)",
                border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"}`,
                borderRadius: "12px",
              }}
            >
              <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#1A9FD4]" />
              <span className="text-xs font-semibold" style={{ color: isDark ? "#e2e8f0" : "#334155" }}>
                {t("Loading data...")}
              </span>
            </div>
          </div>
        )}

        {stateAggregated.length === 0 && !loading ? (
          <div className="india-map-loading flex flex-col items-center justify-center" style={{ height: isMobile ? "380px" : "520px" }}>
            <span style={{ fontSize: 13, color: P.neutral400 }}>
              {t("No state-wise order data available for the selected period.")}
            </span>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="india-map-stats-row">
              <div className="india-map-stat">
                <div className="india-map-stat__icon" style={{ background: "linear-gradient(135deg, #E0F4FD, #C5DCF5)" }}>
                  <PublicIcon style={{ fontSize: 18, color: P.primary }} />
                </div>
                <div>
                  <div className="india-map-stat__label">{t("States Covered")}</div>
                  <div className="india-map-stat__value" style={{ color: P.primary }}>
                    <AnimatedCounter value={totalStates} />
                  </div>
                </div>
              </div>
              <div className="india-map-stat">
                <div className="india-map-stat__icon" style={{ background: "linear-gradient(135deg, #DCFCE7, #BBF7D0)" }}>
                  <TrendingUpIcon style={{ fontSize: 18, color: P.success }} />
                </div>
                <div>
                  <div className="india-map-stat__label">{t("Total Orders")}</div>
                  <div className="india-map-stat__value" style={{ color: P.success }}>
                    <AnimatedCounter value={totalOrders} />
                  </div>
                </div>
              </div>
              <EnhancedTooltip title={topState?.state ? `${t("Click to view")} ${topState.state} ${t("details")}` : ""} placement="top" style={{ flex: 1, minWidth: 140 }}>
                <div
                  className="india-map-stat india-map-stat--clickable"
                  onClick={() => topState?.state && openStateDrill(topState.state)}
                >
                  <div className="india-map-stat__icon" style={{ background: "linear-gradient(135deg, #FEF3C7, #FDE68A)" }}>
                    <LocationOnIcon style={{ fontSize: 18, color: P.warning }} />
                  </div>
                  <div>
                    <div className="india-map-stat__label">{t("Top State")}</div>
                    <div className="india-map-stat__value" style={{ color: isDark ? "#cbd5e1" : P.neutral800, fontSize: 14 }}>
                      {topState?.state || "—"}
                    </div>
                  </div>
                </div>
              </EnhancedTooltip>
            </div>

            {/* Map + Sidebar */}
            <div className="india-map-content">
              {/* Map */}
              <div className="india-map-chart-wrapper">
                <Chart
                  chartType="GeoChart"
                  data={chartData}
                  options={chartOptions}
                  width="100%"
                  height={isMobile ? "380px" : "520px"}
                  chartEvents={[{ eventName: "select", callback: handleChartSelect }]}
                  loader={
                    <div className="india-map-loading flex items-center justify-center" style={{ height: isMobile ? 380 : 520 }}>
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A9FD4]"></div>
                    </div>
                  }
                />
                {/* Color Legend */}
                <div className="india-map-legend">
                  <span style={{ fontSize: 10, color: P.neutral400, fontWeight: 600 }}>{t("Low")}</span>
                  <div className="india-map-legend__bar" />
                  <span style={{ fontSize: 10, color: P.neutral400, fontWeight: 600 }}>{t("High")}</span>
                </div>
              </div>

              {/* Sidebar: Top States Ranking */}
              {!isMobile && (
                <div className="india-map-sidebar">
                  <div className="india-map-sidebar__header">
                    <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#cbd5e1" : P.neutral800 }}>
                      🏆 {t("Top States")}
                    </span>
                    <span style={{ fontSize: 10, color: P.neutral400 }}>
                      {t("Click to explore")}
                    </span>
                  </div>
                  <div className="india-map-sidebar__list">
                    {top10.map((s, idx) => (
                      <EnhancedTooltip key={s.state} title={`${t("Click to view")} ${s.state} ${t("details")}`} placement="left">
                        <div
                          className="india-map-rank-item"
                          onClick={() => openStateDrill(s.state)}
                        >
                          <div className="india-map-rank-item__header" style={{ width: "100%" }}>
                            <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
                              <span className={`india-map-rank-badge rank-${idx === 0 ? "1" : idx === 1 ? "2" : idx === 2 ? "3" : "other"}`}>
                                {idx + 1}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#cbd5e1" : P.neutral800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>
                                {s.state}
                              </span>
                            </div>
                            <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#2374F2" : P.primary }}>
                                {s.order.toLocaleString("en-IN")}
                              </span>
                              <CircularProgressRing value={s.order} maxValue={maxOrder} />
                            </div>
                          </div>
                        </div>
                      </EnhancedTooltip>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile: Top states horizontal scroll */}
            {isMobile && top10.length > 0 && (
              <div className="flex" style={{ gap: 8, overflowX: "auto", padding: "8px 0", marginTop: 8 }}>
                {top10.map((s, idx) => (
                  <div
                    key={s.state}
                    onClick={() => openStateDrill(s.state)}
                    style={{
                      flex: "0 0 auto",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 20,
                      background: idx === 0 ? P.primary : (isDark ? "rgba(26, 159, 212, 0.15)" : P.primary50),
                      color: idx === 0 ? "#fff" : (isDark ? "#2374F2" : P.primary),
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <span>#{idx + 1}</span>
                    <span>{s.state}</span>
                    <span style={{ fontWeight: 700 }}>({s.order})</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default IndiaStateMap;
