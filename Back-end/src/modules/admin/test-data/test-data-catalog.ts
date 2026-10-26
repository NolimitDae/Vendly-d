import { AddOnKind, AddOnPriceUnit, ContractCategory, PaymentPlan } from 'prisma/generated/client';

/**
 * What Admin -> Settings -> Test vendors creates for each service category (matched by name; the
 * seeded list is in prisma/migrations/20261023090000_seed_service_categories). Categories added
 * later get one plain vendor from `fallbackCategory`. Prices follow how each kind of vendor
 * charges: per person for food, per hour for DJs, bars and cars, per day for venues and rentals,
 * fixed for photo packages.
 */

export type PackageUnit = 'fixed' | 'person' | 'hour' | 'day';
export type HoursPreset = 'evenings' | 'daytime' | 'office';

export interface DemoPackage {
  title: string;
  description: string;
  price: number;
  unit: PackageUnit;
  min?: number;
  max?: number;
  included: string[];
  notice_hours: number;
  plan: PaymentPlan;
}

export interface DemoAddOn {
  kind: AddOnKind;
  name: string;
  price: number;
  unit: AddOnPriceUnit;
  description?: string;
  max_quantity?: number;
}

export interface DemoRental {
  title: string;
  description: string;
  daily_rate: number;
  deposit: number;
  quantity: number;
}

export interface DemoVendor {
  /** shown with " (Test)" after it */
  business: string;
  about: string;
  /** sub-category name within the category, if it exists */
  sub?: string;
  radius: number;
  hours: HoursPreset;
  contract: { category: ContractCategory; policy: 'flexible' | 'moderate' | 'strict'; fields: Record<string, string> };
  packages: DemoPackage[];
  addOns: DemoAddOn[];
  rentals?: DemoRental[];
}

export interface DemoCategory {
  /** placeholder photo gradient */
  colors: [string, string];
  vendors: DemoVendor[];
}

const { ADD_ON, FEE } = AddOnKind;
const { FIXED, PER_PERSON, PER_HOUR, PER_ITEM } = AddOnPriceUnit;
const { FULL_ON_ACCEPT, DEPOSIT_50, PAY_AFTER_SERVICE } = PaymentPlan;
const DEMO = 'This is a Vendly test vendor for trying the app. Bookings with it are not real.';
const DAYS = 24;

export const CATALOG: Record<string, DemoCategory> = {
  'Photography & Video': {
    colors: ['#3B1F5C', '#C2549D'],
    vendors: [
      {
        business: 'Brightframe Photography',
        about: `Natural, story-telling wedding and event photography with a relaxed approach. ${DEMO}`,
        sub: 'Wedding photography',
        radius: 60,
        hours: 'evenings',
        contract: { category: ContractCategory.PHOTO_VIDEO, policy: 'moderate', fields: { delivery_time_days: '30', revisions_included: '1', usage_rights: 'personal', edited_images_count: '400' } },
        packages: [
          {
            title: 'Wedding Day Coverage (8 hours)',
            description: 'Full wedding day coverage from getting ready to the first dance, with two photographers so no moment is missed.',
            price: 2800,
            unit: 'fixed',
            included: ['8 hours of coverage', 'Two photographers', '400+ edited photos', 'Private online gallery with downloads', 'Sneak peek within 48 hours'],
            notice_hours: 30 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Engagement Session',
            description: 'A one-hour outdoor or in-studio session, great for save-the-dates and getting comfortable in front of the camera.',
            price: 450,
            unit: 'fixed',
            included: ['1 hour session', 'Up to 2 locations', '60 edited photos', 'Online gallery'],
            notice_hours: 7 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Extra hour', price: 300, unit: FIXED, description: 'One more hour of coverage' },
          { kind: FEE, name: 'Overtime', price: 250, unit: PER_HOUR, description: 'Staying past the booked end time' },
          { kind: FEE, name: 'Extra travel', price: 75, unit: FIXED, description: 'Venues more than 30 miles away' },
        ],
      },
      {
        business: 'Reel Moments Video Co',
        about: `Cinematic highlight films for weddings, parties and company events. ${DEMO}`,
        sub: 'Videography',
        radius: 75,
        hours: 'evenings',
        contract: { category: ContractCategory.PHOTO_VIDEO, policy: 'strict', fields: { delivery_time_days: '45', revisions_included: '2', usage_rights: 'personal', video_length: '5-minute highlight film' } },
        packages: [
          {
            title: 'Event Highlight Film',
            description: 'Up to 6 hours of filming edited into a 5-minute highlight film with licensed music.',
            price: 1600,
            unit: 'fixed',
            included: ['6 hours of filming', '5-minute highlight film', 'Drone shots where allowed', 'Licensed music', 'Two rounds of edits'],
            notice_hours: 14 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Corporate Event Recap Video',
            description: 'A 2-minute recap of your conference, launch or company party, ready for social media.',
            price: 950,
            unit: 'fixed',
            included: ['4 hours of filming', '2-minute recap video', 'Square and vertical versions', 'One round of edits'],
            notice_hours: 7 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Extra hour', price: 250, unit: FIXED, description: 'One more hour of filming' },
          { kind: ADD_ON, name: 'Rush delivery', price: 300, unit: FIXED, description: 'Your film within 7 days' },
        ],
      },
    ],
  },
  'Catering & Food': {
    colors: ['#7A3E12', '#E8A33D'],
    vendors: [
      {
        business: 'Golden Fork Catering Co',
        about: `Southern-style buffets and plated dinners, cooked fresh for weddings, birthdays and company events. ${DEMO}`,
        sub: 'Full-service catering',
        radius: 40,
        hours: 'evenings',
        contract: {
          category: ContractCategory.CATERING,
          policy: 'moderate',
          fields: {
            menu: 'Choice of two mains (herb roast chicken, braised short rib or vegetable lasagna), three sides, garden salad and fresh rolls.',
            headcount_deadline: '10 days before the event',
            service_staff_hours: '5 hours including setup',
          },
        },
        packages: [
          {
            title: 'Southern Buffet Dinner',
            description: 'A generous buffet with two mains, three sides, salad and rolls, set up and served by our team.',
            price: 38,
            unit: 'person',
            min: 25,
            max: 300,
            included: ['Two mains, three sides, salad and rolls', 'Buffet setup with chafing dishes', 'Servers for 4 hours', 'Plates, cutlery and napkins'],
            notice_hours: 10 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Plated Three-Course Dinner',
            description: 'Starter, main and dessert served at the table, with a choice of two mains for your guests.',
            price: 62,
            unit: 'person',
            min: 40,
            max: 200,
            included: ['Starter, main and dessert', 'Choice of two mains', 'Table service', 'Tasting for two before the event'],
            notice_hours: 14 * DAYS,
            plan: DEPOSIT_50,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Additional server', price: 35, unit: PER_HOUR, description: 'One more server for your event' },
          { kind: ADD_ON, name: 'Dessert table', price: 8, unit: PER_PERSON, description: 'Mini desserts and cookies' },
          { kind: ADD_ON, name: 'Appetizers', price: 9, unit: PER_PERSON, description: 'Three passed appetizers' },
          { kind: FEE, name: 'Cake cutting', price: 2, unit: PER_PERSON, description: 'Cutting and serving a cake from another bakery' },
        ],
      },
      {
        business: 'Shake & Pour Mobile Bar',
        about: `A vintage mobile bar with friendly, licensed bartenders for parties of every size. ${DEMO}`,
        sub: 'Bartending & mobile bars',
        radius: 50,
        hours: 'evenings',
        contract: {
          category: ContractCategory.CATERING,
          policy: 'flexible',
          fields: { menu: 'Signature cocktails, beer and wine service, soft drinks and mixers. The host provides the alcohol.', headcount_deadline: '7 days before the event' },
        },
        packages: [
          {
            title: 'Mobile Bar with Bartender',
            description: 'Our mobile bar and a licensed bartender, with ice, cups, garnishes and mixers. You provide the alcohol.',
            price: 95,
            unit: 'hour',
            min: 3,
            max: 8,
            included: ['One licensed bartender', 'Mobile bar setup', 'Ice, cups and garnishes', 'Mixers and soft drinks'],
            notice_hours: 7 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
          {
            title: 'Signature Cocktail Package',
            description: 'Two custom cocktails named for your event, plus beer and wine service for the whole night.',
            price: 18,
            unit: 'person',
            min: 30,
            max: 250,
            included: ['Two signature cocktails', 'Beer and wine service', 'Custom drinks menu sign', 'Up to 5 hours of service'],
            notice_hours: 10 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Bartender', price: 45, unit: PER_HOUR, description: 'A second bartender for busy bars' },
          { kind: FEE, name: 'Overtime', price: 120, unit: PER_HOUR, description: 'Staying past the booked end time' },
          { kind: FEE, name: 'Cleaning', price: 100, unit: FIXED, description: 'Bar area left needing extra cleaning' },
        ],
      },
    ],
  },
  'Music & Entertainment': {
    colors: ['#141E46', '#3E64FF'],
    vendors: [
      {
        business: 'Midnight Groove DJs',
        about: `Wedding and party DJs who read the room and keep the dance floor full. ${DEMO}`,
        sub: 'DJs',
        radius: 60,
        hours: 'evenings',
        contract: {
          category: ContractCategory.ENTERTAINMENT,
          policy: 'moderate',
          fields: {
            performance_length: 'As booked (3 to 8 hours)',
            breaks: '15 minutes every 2 hours',
            equipment_power_needs: 'Two standard outlets within 25 feet of the DJ table',
            song_requests_policy: 'Requests welcome on the night; send a must-play and do-not-play list a week before.',
          },
        },
        packages: [
          {
            title: 'Wedding DJ & MC',
            description: 'DJ and MC for your ceremony, cocktail hour and reception, with a planning call to get every song right.',
            price: 175,
            unit: 'hour',
            min: 4,
            max: 8,
            included: ['Professional DJ and MC', 'Sound system for up to 250 guests', 'Two wireless microphones', 'Dance floor lighting', 'Planning call'],
            notice_hours: 14 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Birthday & Party DJ',
            description: 'A DJ with a compact sound system and party lights for birthdays, graduations and house parties.',
            price: 125,
            unit: 'hour',
            min: 2,
            max: 6,
            included: ['DJ with music for all ages', 'Compact sound system', 'Party lights', 'One wireless microphone'],
            notice_hours: 3 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Uplighting', price: 250, unit: FIXED, description: '12 colour uplights around the room' },
          { kind: ADD_ON, name: 'Extra hour', price: 175, unit: FIXED, description: 'One more hour of music' },
          { kind: FEE, name: 'Overtime', price: 200, unit: PER_HOUR, description: 'Playing past the booked end time' },
        ],
      },
      {
        business: 'Velvet Strings Live Band',
        about: `A four-piece band playing soul, Motown and today's hits, plus an acoustic duo for ceremonies. ${DEMO}`,
        sub: 'Live bands',
        radius: 100,
        hours: 'evenings',
        contract: {
          category: ContractCategory.ENTERTAINMENT,
          policy: 'strict',
          fields: { performance_length: 'Three 45-minute sets', breaks: '15 minutes between sets', equipment_power_needs: 'A 12 x 16 ft stage area and two dedicated circuits' },
        },
        packages: [
          {
            title: 'Four-Piece Band Reception',
            description: 'Three 45-minute sets of live music with a DJ playlist in the breaks.',
            price: 2400,
            unit: 'fixed',
            included: ['Vocals, guitar, bass and drums', 'Three 45-minute sets', 'Sound system and engineer', 'Playlist between sets'],
            notice_hours: 30 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Acoustic Duo Ceremony Set',
            description: 'Guitar and vocals for your ceremony and cocktail hour, including your walk-down-the-aisle song.',
            price: 650,
            unit: 'fixed',
            included: ['Ceremony and cocktail hour (up to 90 minutes)', 'One special song learned for you', 'Small sound system'],
            notice_hours: 14 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Extra hour', price: 400, unit: FIXED, description: 'One more hour of live music' },
          { kind: FEE, name: 'Extra travel', price: 100, unit: FIXED, description: 'Venues more than 50 miles away' },
        ],
      },
    ],
  },
  Venues: {
    colors: ['#1D3B2A', '#5FA36A'],
    vendors: [
      {
        business: 'The Magnolia Hall',
        about: `A bright banquet hall for up to 250 guests, with a bridal suite and plenty of parking. ${DEMO}`,
        sub: 'Banquet halls',
        radius: 0,
        hours: 'evenings',
        contract: {
          category: ContractCategory.VENUE,
          policy: 'strict',
          fields: { capacity: '250', access_hours: '9am to midnight', damage_deposit: '500', noise_curfew: '11:30pm', cleanup_policy: 'Our team cleans up; please remove your own decor by midnight.' },
        },
        packages: [
          {
            title: 'Full-Day Hall Rental',
            description: 'Exclusive use of the hall from 9am to midnight, with tables and chairs for up to 250 guests.',
            price: 3200,
            unit: 'day',
            min: 1,
            max: 2,
            included: ['Exclusive use 9am to midnight', 'Tables and chairs for 250', 'Bridal suite', 'On-site coordinator', 'Parking for 120 cars'],
            notice_hours: 30 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Weekday Meeting Room',
            description: 'A quiet room for up to 40 people with a screen, whiteboard and coffee station.',
            price: 650,
            unit: 'day',
            min: 1,
            max: 5,
            included: ['Room for up to 40', 'Screen and projector', 'Wi-Fi', 'Coffee and water station'],
            notice_hours: 3 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Extra hour', price: 350, unit: FIXED, description: 'Stay one hour longer' },
          { kind: FEE, name: 'Cleaning', price: 250, unit: FIXED, description: 'Venue left needing extra cleaning' },
          { kind: FEE, name: 'Damaged or missing item', price: 50, unit: PER_ITEM, max_quantity: 20 },
        ],
      },
      {
        business: 'Skyline Rooftop Loft',
        about: `An open-air rooftop with city views and an indoor loft for cooler nights. ${DEMO}`,
        sub: 'Rooftops & lofts',
        radius: 0,
        hours: 'evenings',
        contract: { category: ContractCategory.VENUE, policy: 'moderate', fields: { capacity: '120', access_hours: '10am to 11pm', damage_deposit: '400', noise_curfew: '10:30pm' } },
        packages: [
          {
            title: 'Rooftop Evening Rental',
            description: 'The rooftop and loft for your party, with string lights, lounge furniture and a bar counter.',
            price: 1800,
            unit: 'day',
            min: 1,
            max: 1,
            included: ['Rooftop and indoor loft', 'String lights and lounge furniture', 'Bar counter', 'Building security'],
            notice_hours: 21 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Weekday Rooftop Day Hire',
            description: 'Daytime use of the rooftop for photo shoots, team days and small gatherings.',
            price: 1100,
            unit: 'day',
            min: 1,
            max: 3,
            included: ['Rooftop 10am to 5pm', 'Lounge furniture', 'Restrooms and elevator access'],
            notice_hours: 5 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Extra hour', price: 300, unit: FIXED, description: 'Stay one hour longer' },
          { kind: FEE, name: 'Cleaning', price: 200, unit: FIXED, description: 'Venue left needing extra cleaning' },
        ],
      },
    ],
  },
  'Decor & Florals': {
    colors: ['#5B1A3A', '#F28DB2'],
    vendors: [
      {
        business: 'Bloom & Vine Florals',
        about: `Seasonal, garden-style flowers for weddings and celebrations. ${DEMO}`,
        sub: 'Florists',
        radius: 45,
        hours: 'daytime',
        contract: { category: ContractCategory.GENERAL, policy: 'moderate', fields: { setup_time: '2 hours before the event', teardown_time: 'Collected the next morning' } },
        packages: [
          {
            title: 'Wedding Florals Collection',
            description: 'Everything for a wedding party of up to 6 bridesmaids, plus centrepieces for 12 tables.',
            price: 1850,
            unit: 'fixed',
            included: ['Bridal bouquet', '6 bridesmaid bouquets', '8 boutonnieres', '12 table centrepieces', 'Delivery and setup'],
            notice_hours: 21 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Event Centrepieces (10 tables)',
            description: 'Low, lush centrepieces in your colours for 10 tables, delivered and placed.',
            price: 550,
            unit: 'fixed',
            included: ['10 centrepieces', 'Glass vases', 'Delivery and placement'],
            notice_hours: 7 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Delivery and setup', price: 150, unit: FIXED, description: 'We arrange everything on site' },
          { kind: ADD_ON, name: 'Extra item', price: 45, unit: PER_ITEM, description: 'One more centrepiece', max_quantity: 30 },
        ],
      },
      {
        business: 'Glow Events Decor',
        about: `Draping, uplighting and balloon installations that transform any room. ${DEMO}`,
        sub: 'Lighting & draping',
        radius: 50,
        hours: 'daytime',
        contract: { category: ContractCategory.GENERAL, policy: 'flexible', fields: { setup_time: '3 hours before the event', teardown_time: '1 hour after the event' } },
        packages: [
          {
            title: 'Ballroom Draping & Uplighting',
            description: 'Ceiling and wall draping with 16 uplights in your colour, installed and removed by our crew.',
            price: 1200,
            unit: 'fixed',
            included: ['Ceiling and wall draping', '16 colour uplights', 'Installation and removal'],
            notice_hours: 14 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Balloon Garland Setup',
            description: 'A 15-foot organic balloon garland in up to four colours, perfect for a photo backdrop.',
            price: 380,
            unit: 'fixed',
            included: ['15 ft balloon garland', 'Up to 4 colours', 'Setup on site'],
            notice_hours: 3 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Rush delivery', price: 120, unit: FIXED, description: 'Booked less than a week ahead' },
          { kind: FEE, name: 'Damaged or missing item', price: 40, unit: PER_ITEM, max_quantity: 20 },
        ],
      },
    ],
  },
  'Beauty & Glam': {
    colors: ['#4A1650', '#E7A0C8'],
    vendors: [
      {
        business: 'Glam Studio Artistry',
        about: `On-location makeup and hair for brides, bridal parties and photo shoots. ${DEMO}`,
        sub: 'Makeup artists',
        radius: 40,
        hours: 'daytime',
        contract: {
          category: ContractCategory.BEAUTY,
          policy: 'moderate',
          fields: { lateness_policy: 'We arrive 30 minutes before the first appointment. If we are kept waiting more than 30 minutes, later appointments may be shortened.', patch_test_option: 'Free patch test on request' },
        },
        packages: [
          {
            title: 'Bridal Makeup & Hair',
            description: 'Long-wear makeup and a styled look for the bride, with a trial session beforehand.',
            price: 350,
            unit: 'fixed',
            included: ['Trial session', 'Makeup and hair on the day', 'Lashes', 'Touch-up kit'],
            notice_hours: 14 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Bridal Party Makeup',
            description: 'Makeup for bridesmaids, mothers and guests, on location before the ceremony.',
            price: 95,
            unit: 'person',
            min: 2,
            max: 10,
            included: ['Full makeup per person', 'Lashes', 'Setting spray for the day'],
            notice_hours: 7 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Hair styling', price: 65, unit: PER_PERSON, description: 'Updo or curls' },
          { kind: FEE, name: 'Extra travel', price: 60, unit: FIXED, description: 'More than 25 miles away' },
        ],
      },
    ],
  },
  'Event Planning': {
    colors: ['#2D2A5C', '#8F7CEC'],
    vendors: [
      {
        business: 'Crafted Day Planning Co',
        about: `Calm, organised planners who take care of the details so you can enjoy the day. ${DEMO}`,
        sub: 'Day-of coordination',
        radius: 60,
        hours: 'office',
        contract: { category: ContractCategory.GENERAL, policy: 'moderate', fields: {} },
        packages: [
          {
            title: 'Day-of Coordination',
            description: 'We take over a month out: vendor check-ins, a timeline, the rehearsal and running the whole day.',
            price: 1200,
            unit: 'fixed',
            included: ['Planning meeting a month before', 'Vendor confirmations', 'Day-of timeline', 'Rehearsal', 'Up to 10 hours on the day'],
            notice_hours: 30 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Planning Consultation',
            description: 'A sit-down session to build your budget, checklist and vendor shortlist.',
            price: 150,
            unit: 'hour',
            min: 1,
            max: 4,
            included: ['Budget and checklist', 'Vendor shortlist', 'Follow-up notes by email'],
            notice_hours: 2 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Assistant coordinator', price: 45, unit: PER_HOUR, description: 'A second coordinator on the day' },
          { kind: FEE, name: 'Overtime', price: 90, unit: PER_HOUR, description: 'Staying past the booked end time' },
        ],
      },
    ],
  },
  'Rentals & Equipment': {
    colors: ['#203A43', '#2C9AB7'],
    vendors: [
      {
        business: 'Party Pro Rentals',
        about: `Tables, chairs, tents and sound gear, delivered and set up. ${DEMO}`,
        sub: 'Tables & chairs',
        radius: 50,
        hours: 'office',
        contract: {
          category: ContractCategory.RENTALS,
          policy: 'flexible',
          fields: { rental_items: 'As listed in the package booked', security_deposit: '200', late_fee_per_day: '75', delivery_pickup_window: 'Delivery 2 hours before the start, pickup the next morning' },
        },
        packages: [
          {
            title: 'Tables & Chairs for 100',
            description: 'Ten round tables and 100 white folding chairs, delivered, set up and collected.',
            price: 450,
            unit: 'day',
            min: 1,
            max: 3,
            included: ['10 round tables (seat 10 each)', '100 white folding chairs', 'Delivery, setup and pickup'],
            notice_hours: 3 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
          {
            title: 'Sound System & Microphone Package',
            description: 'Two powered speakers, a mixer and two wireless microphones for speeches and background music.',
            price: 250,
            unit: 'day',
            min: 1,
            max: 3,
            included: ['Two powered speakers on stands', 'Mixer', 'Two wireless microphones', 'Cables and setup'],
            notice_hours: 2 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Delivery and setup', price: 120, unit: FIXED, description: 'Set up where you need it' },
          { kind: FEE, name: 'Late return', price: 40, unit: PER_HOUR, description: 'Rented items returned after the agreed time' },
          { kind: FEE, name: 'Damaged or missing item', price: 25, unit: PER_ITEM, max_quantity: 50 },
        ],
        rentals: [
          { title: 'Round Banquet Table (60 in)', description: 'Seats 8 to 10 guests. Linens not included.', daily_rate: 12, deposit: 20, quantity: 40 },
          { title: 'White Folding Chair', description: 'Sturdy white resin folding chair.', daily_rate: 2.5, deposit: 5, quantity: 300 },
          { title: '20 x 30 ft Frame Tent', description: 'Covers about 60 seated guests. Setup included.', daily_rate: 400, deposit: 300, quantity: 2 },
        ],
      },
    ],
  },
  Transportation: {
    colors: ['#232526', '#7B8794'],
    vendors: [
      {
        business: 'Silver Line Limousines',
        about: `Stretch limousines and guest shuttles with professional, uniformed chauffeurs. ${DEMO}`,
        sub: 'Limousines & cars',
        radius: 60,
        hours: 'evenings',
        contract: { category: ContractCategory.GENERAL, policy: 'moderate', fields: { overtime_rate: '160' } },
        packages: [
          {
            title: 'Stretch Limousine',
            description: 'A 10-passenger stretch limousine with a chauffeur, chilled water and a red carpet arrival.',
            price: 145,
            unit: 'hour',
            min: 3,
            max: 10,
            included: ['10-passenger stretch limousine', 'Uniformed chauffeur', 'Chilled water', 'Red carpet arrival'],
            notice_hours: 7 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Guest Shuttle Bus',
            description: 'A 30-seat shuttle between the hotel and the venue, running loops all evening.',
            price: 160,
            unit: 'hour',
            min: 3,
            max: 8,
            included: ['30-seat shuttle bus', 'Driver', 'Continuous loops between two stops'],
            notice_hours: 7 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Champagne toast', price: 60, unit: FIXED, description: 'A bottle of sparkling wine and glasses' },
          { kind: FEE, name: 'Overtime', price: 160, unit: PER_HOUR, description: 'Past the booked end time' },
          { kind: FEE, name: 'Cleaning', price: 150, unit: FIXED, description: 'Vehicle left needing extra cleaning' },
        ],
      },
    ],
  },
  'Staffing & Services': {
    colors: ['#0F3D3E', '#3FB8AF'],
    vendors: [
      {
        business: 'Ready Hands Event Staff',
        about: `Friendly, experienced servers and cleanup crews for events of any size. ${DEMO}`,
        sub: 'Servers & waitstaff',
        radius: 40,
        hours: 'evenings',
        contract: { category: ContractCategory.GENERAL, policy: 'flexible', fields: { overtime_rate: '140' } },
        packages: [
          {
            title: 'Event Server Team (4 servers)',
            description: 'Four servers in black for passing food, clearing tables and keeping the bar stocked.',
            price: 140,
            unit: 'hour',
            min: 4,
            max: 10,
            included: ['Four servers', 'Black uniform', 'Setup and clearing', 'A team lead'],
            notice_hours: 5 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
          {
            title: 'Post-Event Cleanup Crew',
            description: 'A three-person crew to clear, bag trash and leave the venue ready for handover.',
            price: 450,
            unit: 'fixed',
            included: ['Three-person crew', 'Up to 3 hours', 'Trash bags and supplies'],
            notice_hours: 3 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Additional server', price: 35, unit: PER_HOUR, description: 'One more server for your event' },
          { kind: FEE, name: 'Overtime', price: 140, unit: PER_HOUR, description: 'Staying past the booked end time' },
        ],
      },
    ],
  },
  'Kids & Family': {
    colors: ['#F7971E', '#FFD200'],
    vendors: [
      {
        business: 'Bounce Around Party Rentals',
        about: `Clean, safe bounce houses and face painting for kids' parties. ${DEMO}`,
        sub: 'Bounce houses',
        radius: 30,
        hours: 'daytime',
        contract: { category: ContractCategory.GENERAL, policy: 'flexible', fields: { setup_time: '1 hour before the party' } },
        packages: [
          {
            title: 'Castle Bounce House',
            description: 'A 15 x 15 ft castle bounce house with blower and stakes, delivered and set up.',
            price: 225,
            unit: 'day',
            min: 1,
            max: 2,
            included: ['15 x 15 ft castle bounce house', 'Blower and stakes', 'Delivery, setup and pickup', 'Cleaned before every party'],
            notice_hours: 2 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
          {
            title: 'Face Painting',
            description: 'A face painter with glitter tattoos for kids of all ages, about 12 faces an hour.',
            price: 120,
            unit: 'hour',
            min: 2,
            max: 4,
            included: ['Professional face painter', 'Skin-safe paints', 'Glitter tattoos'],
            notice_hours: 3 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Delivery and setup', price: 50, unit: FIXED, description: 'Over 15 miles away' },
          { kind: FEE, name: 'Cleaning', price: 75, unit: FIXED, description: 'Returned needing extra cleaning' },
        ],
      },
    ],
  },
  'Stationery & Gifts': {
    colors: ['#614385', '#516395'],
    vendors: [
      {
        business: 'Paper Petal Studio',
        about: `Custom invitations, place cards and welcome bags, designed with you. ${DEMO}`,
        sub: 'Invitations',
        radius: 100,
        hours: 'office',
        contract: { category: ContractCategory.GENERAL, policy: 'strict', fields: {} },
        packages: [
          {
            title: 'Custom Wedding Invitations (100)',
            description: 'A custom design printed on heavy card, with envelopes and RSVP cards.',
            price: 480,
            unit: 'fixed',
            included: ['Custom design with two rounds of changes', '100 invitations and envelopes', '100 RSVP cards', 'Proof before printing'],
            notice_hours: 21 * DAYS,
            plan: DEPOSIT_50,
          },
          {
            title: 'Welcome Gift Bags',
            description: 'Branded welcome bags with water, snacks and a local treat for each guest.',
            price: 14,
            unit: 'person',
            min: 20,
            max: 300,
            included: ['Printed tote or paper bag', 'Water and snacks', 'A local treat', 'Delivered to your hotel'],
            notice_hours: 10 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Rush delivery', price: 75, unit: FIXED, description: 'Printed within 5 days' },
          { kind: ADD_ON, name: 'Extra item', price: 4, unit: PER_ITEM, description: 'One more invitation set', max_quantity: 200 },
        ],
      },
    ],
  },
  'Officiants & Ceremony': {
    colors: ['#3A1C71', '#D76D77'],
    vendors: [
      {
        business: 'Grace Notes Ceremonies',
        about: `Warm, personal ceremonies for every kind of couple. ${DEMO}`,
        sub: 'Wedding officiants',
        radius: 50,
        hours: 'evenings',
        contract: { category: ContractCategory.GENERAL, policy: 'moderate', fields: {} },
        packages: [
          {
            title: 'Wedding Ceremony Officiant',
            description: 'A ceremony written around your story, with a planning call and filing of your licence.',
            price: 395,
            unit: 'fixed',
            included: ['Planning call', 'Custom ceremony script', 'Officiating on the day', 'Marriage licence filing'],
            notice_hours: 14 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
          {
            title: 'Elopement Ceremony',
            description: 'A short, heartfelt ceremony for two (and a few guests) wherever you like.',
            price: 195,
            unit: 'fixed',
            included: ['Up to 30 minutes', 'Simple ceremony script', 'Marriage licence filing'],
            notice_hours: 2 * DAYS,
            plan: PAY_AFTER_SERVICE,
          },
        ],
        addOns: [
          { kind: ADD_ON, name: 'Rehearsal', price: 150, unit: FIXED, description: 'Running your rehearsal the day before' },
          { kind: FEE, name: 'Extra travel', price: 50, unit: FIXED, description: 'More than 25 miles away' },
        ],
      },
    ],
  },
};

const FALLBACK_COLORS: [string, string][] = [
  ['#42275A', '#734B6D'],
  ['#134E5E', '#71B280'],
  ['#2C3E50', '#4CA1AF'],
  ['#603813', '#B29F94'],
];

/** One plain vendor for a category without its own entry (added by an admin after the seed). */
export function fallbackCategory(name: string, index = 0): DemoCategory {
  return {
    colors: FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    vendors: [
      {
        business: `${name} Pros`,
        about: `${name} for parties, weddings and company events. ${DEMO}`,
        radius: 40,
        hours: 'evenings',
        contract: { category: ContractCategory.GENERAL, policy: 'moderate', fields: {} },
        packages: [
          {
            title: `${name} Package`,
            description: `Our most popular ${name.toLowerCase()} package for events of up to 100 guests.`,
            price: 500,
            unit: 'fixed',
            included: ['Planning call', 'Setup and pack-down', 'Up to 4 hours on the day'],
            notice_hours: 7 * DAYS,
            plan: FULL_ON_ACCEPT,
          },
        ],
        addOns: [{ kind: FEE, name: 'Extra travel', price: 50, unit: FIXED, description: 'More than 25 miles away' }],
      },
    ],
  };
}

/** Weekly hours for a preset, in the vendor's time zone. */
export function workingHoursFor(preset: HoursPreset, timezone: string) {
  const day = (open: string, close: string) => ({ open, close });
  if (preset === 'daytime') {
    return { mon: day('08:00', '20:00'), tue: day('08:00', '20:00'), wed: day('08:00', '20:00'), thu: day('08:00', '20:00'), fri: day('08:00', '20:00'), sat: day('08:00', '20:00'), sun: null, timezone };
  }
  if (preset === 'office') {
    return { mon: day('09:00', '18:00'), tue: day('09:00', '18:00'), wed: day('09:00', '18:00'), thu: day('09:00', '18:00'), fri: day('09:00', '18:00'), sat: day('10:00', '16:00'), sun: null, timezone };
  }
  const evening = day('09:00', '24:00');
  return { mon: evening, tue: evening, wed: evening, thu: evening, fri: evening, sat: evening, sun: evening, timezone };
}
