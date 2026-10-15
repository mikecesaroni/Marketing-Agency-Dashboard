/**
 * The season playbook: what a home-services company should be selling right
 * now, how, and which template says it best.
 *
 * A trade's year is not four seasons; it is peaks and shoulders. An HVAC
 * company has two peaks (the heat wave, the cold snap) when the phone rings
 * by itself and the ad's job is to be the one they call, and two shoulders
 * (spring, fall) when nothing is broken and the ad's job is to get into the
 * house cheaply (a tune-up, a plan) and book the replacements while the
 * install crews have room. A plumber's peaks are the freeze and the week
 * after Thanksgiving. The playbook knows these, by trade and by climate,
 * and turns them into tactics, offer shapes, the kicker, the unit in the
 * corner, and a ranked list of templates.
 *
 * Pure on purpose: scripts/check-season-playbook.mjs imports it, and the
 * chat prompt, the batch and the Studio all read the same answer.
 */

import { climateOf, seasonOf, seasonalFocus, tradeOf, upcomingMoments } from './season.js'
import { PHOTO_TEMPLATES, TEMPLATE_KEYS, TWO_PHOTO_TEMPLATES } from './adTemplateMeta.js'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function monthOf(today) {
  const d = today instanceof Date ? today : new Date(today || Date.now())
  return d.getMonth() + 1
}

// ---------------------------------------------------------------------------
// the phases
// ---------------------------------------------------------------------------

const HVAC = {
  heating_peak: {
    label: 'Peak heating season',
    summary: 'The cold is doing the selling. Phones ring on their own; the ad\'s job is to be the company they call, and to turn a third repair into a replacement.',
    tactics: [
      'Lead with speed and calm: same-day, "no heat? we are on the way", what the visit costs.',
      'Repair versus replace: a 15-year-old furnace on its third repair is a replacement with financing, not a patch.',
      'Financing is the offer: $0 down and a monthly number beat a dollar discount when it is freezing.',
      'Carbon monoxide and safety angles land now; so does the heating bill.',
    ],
    avoid: ['Tune-up promos (too late, and the crews are full)', 'Anything AC', 'Long copy; the reader is cold and in a hurry'],
    offers: ['$0 down, 0% for 18 months', '$500 off a new furnace installed', 'Free second opinion on any repair quote over $500', '$79 diagnostic, waived with the repair'],
    hooks: ['No heat? We are on the way today', 'Stop paying to patch a dying furnace', 'Third repair this winter? Here is the math'],
    templates: [
      ['emergency', 'the no-heat call: dark, urgent, 24/7'],
      ['financing', '$0 down is the offer when it is freezing'],
      ['winter_shout', 'the snow poster with the price huge'],
      ['massive_deal', 'the replacement deal, loud'],
      ['big_number', 'one number, the whole ad'],
    ],
    cutout: 'furnace',
    theme: 'snow',
    kicker: 'Winter Sale',
    season: 'winter',
  },
  spring_shoulder: {
    label: 'Spring shoulder season (AC prep)',
    summary: 'Nothing is broken, so nobody is calling. Get into the house cheaply with a tune-up or a plan, and book the replacements now while the install calendar is open: the best pricing of the year.',
    tactics: [
      'A low-price AC tune-up is the door opener: the goal is the visit, not the margin.',
      'Pre-season replacement deals: crews have room, so the discount is real and the install date is this week.',
      'Maintenance plan sign-ups: a monthly number, priority service, the tune-ups included.',
      'Allergy season and indoor air quality; tax refund money for a new system.',
    ],
    avoid: ['Emergency language (nothing is broken yet)', 'Furnace content', 'Deep repair discounts'],
    offers: ['$89 AC tune-up', 'Join the plan: $14 a month, two tune-ups a year', 'Up to $1,500 off a new system, pre-season', 'Free in-home estimate'],
    hooks: ['Tune it up before the first hot week', 'Beat the summer rush on a new AC', 'Your AC has not run since September'],
    templates: [
      ['tune_up', 'the service price in a starburst on spring green'],
      ['price_grid', 'tune-up, plan and install prices side by side'],
      ['coupon', 'the tune-up as a clip-out coupon'],
      ['plan_card', 'the maintenance plan with what is included'],
      ['before_sale', 'the rusted unit and the new one'],
      ['season_sale', 'the spring sale poster'],
    ],
    cutout: 'ac',
    theme: 'fresh',
    kicker: 'Spring Tune-Up Special',
    season: 'spring',
  },
  cooling_ramp: {
    label: 'Early cooling season',
    summary: 'The first hot days are days away. Last call on tune-ups, and the replacement deal while there is still schedule to install it before the heat.',
    tactics: [
      '"Before the first heat wave": the deadline is the weather, and it is close.',
      'Last-call tune-up at the same low price, then it goes away.',
      'Replacement promos with a date: installed before Memorial Day.',
      'The first 90-degree day fills the phones; be running before it.',
    ],
    avoid: ['Furnace content', 'Vague year-round messaging'],
    offers: ['$89 AC tune-up, last week', '$500 off a new AC installed before the heat', '$0 down, 0% for 18 months', 'Free second opinion'],
    hooks: ['Beat the heat, and the rush', 'Will your AC make it through July?', 'Installed before the first heat wave'],
    templates: [
      ['season_sale', 'the sun poster with SALE huge'],
      ['tune_up', 'the last-call tune-up price'],
      ['financing', 'the replacement with a monthly number'],
      ['big_number', 'the discount as one big number'],
      ['price_grid', 'tune-up and install prices together'],
    ],
    cutout: 'ac',
    theme: 'sun',
    kicker: 'Beat the Heat',
    season: 'summer',
  },
  cooling_peak: {
    label: 'Peak cooling season',
    summary: 'The heat is doing the selling. Sell repair and replacement, not tune-ups: the crews are full and the caller is sweating.',
    tactics: [
      'Same-day repair and "AC not keeping up?": speed and what the visit costs.',
      'Replace a 10-plus-year-old unit instead of patching it again; financing makes the monthly number small.',
      'Heat wave urgency and the electric bill.',
      'In hot markets: hurricane season, surge protection, humidity.',
    ],
    avoid: ['Tune-up promos (no capacity, and nobody wants a check-up in a heat wave)', 'Furnace content'],
    offers: ['Same-day AC repair, $69 diagnostic', '$0 down, 0% for 18 months on a new system', '$500 off a new AC', 'Free second opinion on any replacement quote'],
    hooks: ['AC not keeping up? Same-day repair', 'Stop paying to patch a dying AC', 'Beat the heat with a new system and $0 down'],
    templates: [
      ['emergency', 'the AC-is-dead call: 24/7, same day'],
      ['season_sale', 'the summer sale poster'],
      ['financing', '$0 down on the replacement'],
      ['big_number', 'the discount as one big number'],
      ['photo_sale', 'the van or the crew with the offers below'],
      ['massive_deal', 'the loud replacement deal'],
    ],
    cutout: 'ac',
    theme: 'sun',
    kicker: 'Beat the Heat',
    season: 'summer',
  },
  fall_shoulder: {
    label: 'Fall shoulder season (heating prep)',
    summary: 'The AC is off and the furnace has not run since March. Get into the house with a tune-up or a safety inspection, sign them to a plan, and book the replacements at off-season pricing before the first cold night.',
    tactics: [
      'A low-price furnace tune-up or free heating safety inspection is the door opener.',
      '"Be ready for winter" and "before the first cold night": the deadline is the weather.',
      'Off-season replacement pricing: install crews have room until the first freeze.',
      'Maintenance plan sign-ups, carbon monoxide safety, year-end rebates with a date.',
    ],
    avoid: ['Emergency language (nothing is broken yet)', 'AC content', 'Waiting for the cold to run ads; by then the phones are full'],
    offers: ['$89 furnace tune-up', 'Free heating safety inspection', '$0 down, 0% for 18 months on a new furnace', 'Up to $2,000 in rebates, ends December 31'],
    hooks: ['Be ready for winter', 'Your furnace has not run since March', 'Book the install before the first freeze'],
    templates: [
      ['tune_up', 'the tune-up price in a starburst'],
      ['fall_special', 'leaves, two offers stacked, the unit'],
      ['price_grid', 'tune-up, plan and install prices together'],
      ['coupon', 'the tune-up as a clip-out coupon'],
      ['plan_card', 'the maintenance plan with what is included'],
      ['winter_shout', 'the be-ready-for-winter poster'],
      ['before_sale', 'the old furnace and the new one'],
    ],
    cutout: 'furnace',
    theme: 'leaves',
    kicker: 'Fall Special',
    season: 'fall',
  },
  holiday: {
    label: 'Holiday and year-end',
    summary: 'A house full of guests, a deadline on December 31, and the first real cold. Holiday deals, rebates and financing that end with the year, and the furnace that must not quit with company coming.',
    tactics: [
      'Year-end deadlines: rebates, 0% financing and the tax credit end December 31.',
      'Guests coming: the worst time for a breakdown; book the check-up before Thanksgiving.',
      'Holiday deals with a number, kept simple; people are busy.',
      'The first real cold snap turns this into emergency season overnight.',
    ],
    avoid: ['Long copy', 'AC content outside hot markets'],
    offers: ['Holiday deal: $500 off a new furnace', '0% financing through December 31', 'Furnace tune-up before the guests arrive', 'Free second opinion'],
    hooks: ['Holiday deals on a new furnace', 'Rebates end December 31', 'Do not let the furnace quit with a full house'],
    templates: [
      ['holiday_deals', 'red and green with snow'],
      ['financing', 'the year-end financing deadline'],
      ['coupon', 'the holiday offer as a coupon'],
      ['emergency', 'the first cold snap'],
      ['winter_shout', 'the snow poster'],
    ],
    cutout: 'furnace',
    theme: 'holiday',
    kicker: 'Holiday Deals',
    season: 'holiday',
  },
  cool_offseason: {
    label: 'Off-season (replacement deals)',
    summary: 'A hot market in its few cool months: the AC is finally off, the install crews have room, and this is the best replacement pricing of the year.',
    tactics: [
      'Off-season replacement deals with a date: installed before the heat comes back.',
      'Heat pump and heat strip checks for the handful of cold nights.',
      'Tax refund money for a new system; indoor air quality.',
      'Maintenance plan sign-ups before the summer rush.',
    ],
    avoid: ['Heat wave urgency', 'Furnace content'],
    offers: ['Up to $1,500 off a new system, off-season', '$0 down, 0% for 18 months', '$79 heat pump check', 'Join the plan: $14 a month'],
    hooks: ['The best time to replace your AC is now', 'Beat the summer rush and the summer price', 'Your AC earned a break; give it a check-up'],
    templates: [
      ['financing', 'the replacement with a monthly number'],
      ['big_number', 'the off-season discount huge'],
      ['price_grid', 'check-up, plan and install prices'],
      ['coupon', 'the check-up as a coupon'],
      ['before_sale', 'the old unit and the new one'],
    ],
    cutout: 'ac',
    theme: 'brand',
    kicker: 'Off-Season Sale',
    season: 'winter',
  },
  hot_break: {
    label: 'The break after summer',
    summary: 'A hot market in October: the AC finally gets a rest after a brutal summer. A post-summer check-up, humidity, and off-peak replacement pricing before next summer.',
    tactics: [
      'Post-summer check-up: the unit just ran six months straight.',
      'Off-peak replacement pricing with a date before next summer.',
      'Humidity and indoor air; hurricane season ends.',
      'Maintenance plan sign-ups while nothing is urgent.',
    ],
    avoid: ['Furnace and snow content', 'Heat wave urgency'],
    offers: ['$89 post-summer AC check-up', 'Up to $1,500 off a new system', '$0 down, 0% for 18 months', 'Join the plan: $14 a month'],
    hooks: ['Your AC just ran six months straight', 'The off-peak price on a new system', 'Humidity is not supposed to be indoors'],
    templates: [
      ['tune_up', 'the check-up price in a starburst'],
      ['price_grid', 'check-up, plan and install prices'],
      ['financing', 'the replacement with a monthly number'],
      ['plan_card', 'the maintenance plan with what is included'],
      ['coupon', 'the check-up as a coupon'],
    ],
    cutout: 'ac',
    theme: 'leaves',
    kicker: 'Fall Check-Up',
    season: 'fall',
  },
}

const PLUMBING = {
  freeze: {
    label: 'Freeze season',
    summary: 'Frozen and burst pipes, and water heaters that quit when the incoming water turns cold. Speed, same-day water heater replacement, and financing.',
    tactics: [
      '"No hot water?" and "burst pipe?": same-day, what the visit costs.',
      'Water heater replacement with a monthly number; a 12-year-old tank in January is a replacement.',
      'Frozen pipe prevention before the cold snap, emergency during it.',
    ],
    avoid: ['Outdoor and sprinkler content', 'Long copy'],
    offers: ['Same-day water heater replacement', '$0 down, 0% for 18 months', '$49 drain cleaning', '$79 diagnostic, waived with the repair'],
    hooks: ['No hot water? Same day', 'A burst pipe does not wait for Monday', 'Replace the tank before it floods the basement'],
    templates: [
      ['emergency', 'the burst-pipe call: dark, urgent, 24/7'],
      ['financing', 'the water heater with a monthly number'],
      ['big_number', 'the discount as one big number'],
      ['coupon', 'the drain special as a coupon'],
      ['winter_shout', 'the snow poster'],
    ],
    cutout: 'water_heater',
    theme: 'snow',
    kicker: 'Winter Sale',
    season: 'winter',
  },
  spring: {
    label: 'Spring (sump pumps, flushes, drains)',
    summary: 'The thaw and the rain: sump pump checks, water heater flushes, drains after a winter of use, outdoor spigots. Low-price services that get into the house.',
    tactics: [
      'Sump pump inspection before the spring rain; the basement is the fear.',
      'Water heater flush and inspection at a low price.',
      'Drain cleaning specials; spring cleaning energy.',
      'Maintenance plan sign-ups while nothing is urgent.',
    ],
    avoid: ['Emergency language', 'Freeze content'],
    offers: ['Free sump pump inspection', '$99 water heater flush', '$49 drain cleaning special', 'Join the plan: $12 a month'],
    hooks: ['Will your sump pump keep up with the spring rain?', 'Flush the tank before it fails', 'Drains slow after winter?'],
    templates: [
      ['tune_up', 'the service price in a starburst'],
      ['coupon', 'the special as a clip-out coupon'],
      ['price_grid', 'flush, drain and inspection prices together'],
      ['plan_card', 'the plan with what is included'],
      ['season_sale', 'the spring sale poster'],
    ],
    cutout: 'water_heater',
    theme: 'fresh',
    kicker: 'Spring Special',
    season: 'spring',
  },
  summer: {
    label: 'Summer (sewer lines, hidden leaks)',
    summary: 'Water use is at its peak: sewer line roots, hidden leaks showing up on the bill, outdoor lines, repipes while the ground is soft.',
    tactics: [
      'Sewer line camera inspection and before-and-after of a cleared line.',
      'High water bill means a hidden leak: a leak check offer.',
      'Repipe and sewer replacement with financing while the weather allows.',
      'Vacation-home checks and outdoor spigots.',
    ],
    avoid: ['Freeze content', 'Holiday content'],
    offers: ['$99 sewer camera inspection', 'Free leak check with any service', '$0 down on a repipe', '$49 drain cleaning'],
    hooks: ['Water bill up? Something is leaking', 'Roots in the sewer line show up in July', 'See inside your sewer line for $99'],
    templates: [
      ['coupon', 'the inspection as a coupon'],
      ['before_sale', 'the clogged line and the clear one'],
      ['price_grid', 'the summer services priced together'],
      ['photo_sale', 'the truck or the crew with the offers below'],
      ['emergency', 'the backup call'],
    ],
    cutout: 'water_heater',
    theme: 'sun',
    kicker: 'Summer Special',
    season: 'summer',
  },
  fall: {
    label: 'Fall (water heaters before winter)',
    summary: 'Water heaters before the cold, winterizing outdoor lines, pipe insulation, maintenance plans, and the holiday guests to come.',
    tactics: [
      'Water heater replacement before winter: the old tank works harder when the incoming water turns cold.',
      'Winterize outdoor lines and spigots; frozen pipe prevention.',
      'Maintenance plan sign-ups; a drain cleaning before the holidays.',
      'Rebates and financing with a year-end date.',
    ],
    avoid: ['Emergency language', 'Sprinkler content'],
    offers: ['$0 down on a new water heater', '$89 water heater tune-up', 'Free winterization check with any service', 'Up to $500 in rebates, ends December 31'],
    hooks: ['Replace the tank before winter does it for you', 'Be ready for the cold and the guests', 'Your water heater is 12 years old'],
    templates: [
      ['tune_up', 'the tune-up price in a starburst'],
      ['fall_special', 'leaves, two offers stacked, the unit'],
      ['coupon', 'the check as a coupon'],
      ['financing', 'the water heater with a monthly number'],
      ['plan_card', 'the plan with what is included'],
    ],
    cutout: 'water_heater',
    theme: 'leaves',
    kicker: 'Fall Special',
    season: 'fall',
  },
  holiday: {
    label: 'Holiday (guests and the Friday after Thanksgiving)',
    summary: 'The busiest week of a plumber\'s year is the one after Thanksgiving: kitchen drains, disposals and a water heater asked to serve a full house. Book the check-up before the guests, be the emergency call after.',
    tactics: [
      'Before Thanksgiving: a drain and disposal check so the holiday does not end in a backup.',
      'The week after: same-day drain cleaning, calm and fast.',
      'A full house and one water heater: capacity and replacement with financing.',
      'Year-end rebates and financing deadlines.',
    ],
    avoid: ['Long copy', 'Outdoor content'],
    offers: ['$49 holiday drain cleaning', 'Same-day service through the holidays', '$0 down on a new water heater', 'Free disposal check with any service'],
    hooks: ['Guests coming? Check the drains first', 'The Friday after Thanksgiving is our busiest day', 'One water heater, twelve people'],
    templates: [
      ['holiday_deals', 'red and green with snow'],
      ['emergency', 'the backup call, same day'],
      ['coupon', 'the holiday drain special as a coupon'],
      ['financing', 'the water heater with a monthly number'],
    ],
    cutout: 'water_heater',
    theme: 'holiday',
    kicker: 'Holiday Deals',
    season: 'holiday',
  },
}

// The trades without an equipment unit to stand in the corner get a phase
// built from the season's focus line (season.js) and a sensible template mix.
const GENERIC_TEMPLATES = {
  winter: [
    ['emergency', 'the breakdown call in the cold'],
    ['financing', 'the big job with a monthly number'],
    ['coupon', 'the offer as a coupon'],
    ['big_number', 'one number, the whole ad'],
    ['winter_shout', 'the snow poster'],
  ],
  spring: [
    ['tune_up', 'the service price in a starburst'],
    ['price_grid', 'the spring services priced together'],
    ['coupon', 'the special as a coupon'],
    ['before_sale', 'the before and the after'],
    ['season_sale', 'the spring sale poster'],
  ],
  summer: [
    ['photo_sale', 'the crew or the job with the offers below'],
    ['season_sale', 'the summer sale poster'],
    ['before_sale', 'the before and the after'],
    ['coupon', 'the special as a coupon'],
    ['big_number', 'one number, the whole ad'],
  ],
  fall: [
    ['fall_special', 'leaves, two offers stacked'],
    ['coupon', 'the offer as a coupon'],
    ['price_grid', 'the fall services priced together'],
    ['financing', 'the big job before winter with a monthly number'],
    ['before_sale', 'the before and the after'],
  ],
  holiday: [
    ['holiday_deals', 'red and green with snow'],
    ['coupon', 'the holiday offer as a coupon'],
    ['financing', 'the year-end financing deadline'],
    ['emergency', 'the holiday breakdown call'],
  ],
}

const GENERIC_TACTICS = {
  winter: ['Emergencies in the cold: speed, calm, what the visit costs.', 'The big job with a monthly number: financing beats a discount in January.', 'Book spring work now at this year\'s price.'],
  spring: ['Get on the schedule early: the first sunny week fills the calendar.', 'A low-price inspection or tune-up is the door opener.', 'Before and after photos do the selling.'],
  summer: ['The busy season: be the one they call, same-day where true.', 'Show the work: the crew, the truck, a finished job.', 'Projects before fall with a date.'],
  fall: ['Get the house ready for winter: the deadline is the weather.', 'Finish it before the holidays and the guests.', 'Rebates and financing that end with the year.'],
  holiday: ['Holiday deals with a number, kept simple.', 'Guests coming: the worst time for a breakdown.', 'Year-end deadlines on rebates and financing.'],
}

const SEASON_KICKER = { winter: 'Winter Sale', spring: 'Spring Special', summer: 'Summer Sale', fall: 'Fall Special', holiday: 'Holiday Deals' }
const SEASON_THEME = { winter: 'snow', spring: 'fresh', summer: 'sun', fall: 'leaves', holiday: 'holiday' }

// Trades with a unit of their own, and the seasonal tweaks worth stating.
const TRADE_EXTRAS = {
  electrical: {
    cutout: { winter: 'thermostat', spring: 'thermostat', summer: 'thermostat', fall: 'thermostat', holiday: 'thermostat' },
    tactics: {
      winter: ['Generators and outages; overloaded circuits from space heaters.'],
      spring: ['Panel upgrades and EV chargers; outdoor lighting and outlets.'],
      summer: ['Storm season: surge protection; AC tripping breakers; pool and hot tub wiring.'],
      fall: ['A generator before the winter storms; holiday lighting circuits; smoke and CO detector checks.'],
      holiday: ['Holiday lights tripping breakers; a generator for the storms.'],
    },
    offers: {
      winter: ['Whole-home generator, $0 down', 'Free panel safety check'],
      spring: ['EV charger installed from $899', 'Panel upgrade financing'],
      summer: ['Whole-home surge protection from $299', 'Same-day electrical repair'],
      fall: ['Generator installed before winter, $0 down', 'Free smoke and CO detector check'],
      holiday: ['Holiday lighting circuits installed', 'Generator financing through December 31'],
    },
  },
  roofing: {
    cutout: {},
    tactics: {
      winter: ['Ice dams and leaks showing in the snow; emergency tarps; lock in spring pricing now.'],
      spring: ['Storm and hail damage inspections; insurance claims; missing shingles after winter.'],
      summer: ['Peak install season: financing and a date; heat-cracked shingles.'],
      fall: ['Get it done before winter; gutters and guards; storm damage inspections.'],
      holiday: ['Year-end financing; emergency leaks in the first storms.'],
    },
    offers: {
      winter: ['Free ice dam and leak inspection', 'Book spring at this year\'s price'],
      spring: ['Free storm damage inspection', 'We handle the insurance claim'],
      summer: ['$0 down, 0% for 18 months on a new roof', 'Free estimate this week'],
      fall: ['Installed before winter, financing available', 'Free gutter check with any repair'],
      holiday: ['0% financing through December 31', 'Emergency leak repair'],
    },
    templates: {
      spring: [['before_sale', 'the storm damage and the new roof'], ['reveal', 'the new roof with the old one inset'], ['coupon', 'the free inspection as a coupon'], ['photo_sale', 'the crew on the roof']],
      summer: [['reveal', 'the new roof with the old one inset'], ['financing', 'the new roof with a monthly number'], ['before_sale', 'the before and the after'], ['photo_sale', 'the crew on the roof']],
      fall: [['before_sale', 'the before and the after'], ['financing', 'installed before winter, monthly'], ['coupon', 'the inspection as a coupon'], ['fall_special', 'leaves, two offers stacked']],
      winter: [['emergency', 'the leak and the ice dam'], ['coupon', 'the free inspection'], ['financing', 'spring pricing locked now'], ['reveal', 'the finished roof']],
    },
  },
  lawn: {
    cutout: {},
    tactics: {
      winter: ['Snow removal; book spring service early; tree work while the leaves are down.'],
      spring: ['Spring cleanup and first cuts; mulch and plantings; weekly service sign-ups.'],
      summer: ['Weekly mowing so they get their weekends back; irrigation; brown patches.'],
      fall: ['Leaf cleanup; aeration and overseeding; winterizing sprinklers.'],
      holiday: ['Holiday lighting and snow removal contracts.'],
    },
    offers: {
      winter: ['Snow removal from $49 a visit', 'Book spring cleanup now, save $50'],
      spring: ['Spring cleanup from $199', 'First mow free with a season sign-up'],
      summer: ['Weekly mowing from $45', 'Free irrigation check'],
      fall: ['Leaf cleanup from $149', 'Aeration and overseeding special'],
      holiday: ['Holiday lighting installed', 'Snow removal contracts'],
    },
    templates: {
      summer: [['plan_card', 'weekly service with what is included'], ['photo_sale', 'the crew and the lawn'], ['before_sale', 'the before and the after'], ['coupon', 'the special as a coupon']],
    },
  },
  pest: {
    cutout: {},
    tactics: {
      winter: ['Mice and rodents moving inside; a prevention plan.'],
      spring: ['Ants, termite swarms, wasps starting nests; a spring inspection.'],
      summer: ['Mosquitoes and wasps; the backyard season.'],
      fall: ['Mice and spiders moving indoors; seal the house before winter.'],
      holiday: ['Rodents and holiday guests; a prevention plan.'],
    },
    offers: {
      winter: ['Free rodent inspection', 'Quarterly plan from $39 a month'],
      spring: ['Free termite inspection', 'First treatment $49 with a plan'],
      summer: ['Mosquito treatment from $69', 'Yard plan from $39 a month'],
      fall: ['Free rodent-proofing inspection', 'Quarterly plan from $39 a month'],
      holiday: ['Free rodent inspection', 'Plan sign-up, first month free'],
    },
    templates: {
      spring: [['plan_card', 'the quarterly plan with what is included'], ['coupon', 'the inspection as a coupon'], ['tune_up', 'the first treatment price'], ['season_sale', 'the spring poster']],
      summer: [['season_sale', 'the summer poster'], ['plan_card', 'the yard plan'], ['coupon', 'the treatment as a coupon'], ['photo_sale', 'the tech at the house']],
      fall: [['plan_card', 'the quarterly plan'], ['coupon', 'the inspection as a coupon'], ['fall_special', 'leaves, two offers stacked']],
    },
  },
}

function hvacPhase(m, climate) {
  if (climate === 'hot') {
    if (m === 11 || m === 12) return 'holiday'
    if (m === 1 || m === 2) return 'cool_offseason'
    if (m === 3 || m === 4) return 'spring_shoulder'
    if (m === 5) return 'cooling_ramp'
    if (m >= 6 && m <= 9) return 'cooling_peak'
    return 'hot_break'
  }
  if (m === 11 || m === 12) return 'holiday'
  if (m === 1 || m === 2) return 'heating_peak'
  if (m === 3 || m === 4) return 'spring_shoulder'
  if (m === 5) return 'cooling_ramp'
  if (m >= 6 && m <= 8) return 'cooling_peak'
  return 'fall_shoulder'
}

function plumbingPhase(m) {
  if (m === 11 || m === 12) return 'holiday'
  if (m === 1 || m === 2) return 'freeze'
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  return 'fall'
}

/** The season for a generic trade: the calendar's, holiday in November and December. */
function genericSeason(m, climate) {
  if (m === 11 || m === 12) return 'holiday'
  return seasonOf(`2000-${String(m).padStart(2, '0')}-15`, climate)
}

function genericPhase(trade, m, climate) {
  const season = genericSeason(m, climate)
  const extras = TRADE_EXTRAS[trade] || {}
  const focus = seasonalFocus(trade, season === 'holiday' ? 'winter' : season, climate)
  const name = season.charAt(0).toUpperCase() + season.slice(1)
  return {
    label: season === 'holiday' ? 'Holiday and year-end' : `${name} season`,
    summary: `What homeowners are thinking about: ${focus}.`,
    tactics: [...(extras.tactics?.[season] || []), ...GENERIC_TACTICS[season]],
    avoid: season === 'holiday' ? ['Long copy'] : ['Content for another season'],
    offers: extras.offers?.[season] || [],
    hooks: [],
    templates: extras.templates?.[season] || GENERIC_TEMPLATES[season],
    cutout: extras.cutout?.[season] || '',
    theme: season === 'holiday' ? 'holiday' : SEASON_THEME[season],
    kicker: SEASON_KICKER[season],
    season,
  }
}

/**
 * The phase of the year for a client: trade, climate and month in, the
 * playbook out. `today` may be a Date or an ISO string.
 */
export function phaseOf({ industry = '', market = '', today = new Date() } = {}) {
  const trade = tradeOf(industry)
  const climate = climateOf(market)
  const m = monthOf(today)
  let key
  let base
  if (trade === 'hvac' || trade === 'hvac_plumbing') {
    key = hvacPhase(m, climate)
    base = HVAC[key]
    if (trade === 'hvac_plumbing') {
      const p = PLUMBING[plumbingPhase(m)]
      base = { ...base, tactics: [...base.tactics, `On the plumbing side: ${p.summary}`], offers: [...base.offers, ...p.offers.slice(0, 2)] }
    }
  } else if (trade === 'plumbing') {
    key = plumbingPhase(m)
    base = PLUMBING[key]
  } else {
    key = genericSeason(m, climate)
    base = genericPhase(trade, m, climate)
  }
  const moments = upcomingMoments(today instanceof Date ? today : new Date(today), climate, 45)
  return {
    key,
    trade,
    climate,
    month: MONTHS[m - 1],
    ...base,
    templates: base.templates.map(([k, why]) => ({ key: k, why })),
    moments,
  }
}

// ---------------------------------------------------------------------------
// choosing a template for an ad
// ---------------------------------------------------------------------------

const WORDS = {
  financing: /\$0 down|0%|\b\d+ months\b|financ|\bapr\b|per month|\/mo\b|a month\b|monthly/i,
  emergency: /same.?day|24\/7|emergenc|no heat|no ac|no a\/c|no hot water|not working|broke|broken|repair today|tonight|on the way|burst|backed up|backup|leak(ing)? now|storm/i,
  service: /tune.?up|inspection|check.?up|maintenance|flush|cleaning|safety check/i,
  plan: /\bplan\b|club|member|priority service|included/i,
  free: /\bfree\b/i,
  sale: /\bsale\b|deals?\b|massive|blowout|clearance|save\b/i,
  holiday: /holiday|christmas|thanksgiving|black friday|new year|year.?end/i,
  beforeAfter: /before and after|before\/after|transformation|replaced|old (unit|furnace|ac|roof|tank)/i,
}

function words(content) {
  return ['kicker', 'badge', 'hook', 'offerAmount', 'offerDetail', 'subhead', 'sticker', 'primaryText', 'headline']
    .map((k) => content?.[k] || '')
    .join(' ')
}

/**
 * The best template for an ad: the phase's own ranking, then what the words
 * say (financing, an emergency, a tune-up, a plan, a sale), then what there
 * is to show (a photo, a pair of photos, several prices). Returns
 * { key, reason, ranked } where ranked is every template with its score and
 * why, best first. `exclude` keeps a batch from using one template twice.
 */
export function pickTemplate({ phase, content = {}, hasPhoto = false, hasAfter = false, exclude = [] } = {}) {
  const text = words(content)
  const offers = Array.isArray(content.offers) ? content.offers.filter((o) => o && (o.amount || o.detail)) : []
  const amount = String(content.offerAmount || '').trim()
  const scores = Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, { score: 0, why: [] }]))
  const add = (key, n, why) => {
    if (!scores[key]) return
    scores[key].score += n
    if (why && n > 0) scores[key].why.push(why)
  }
  ;(phase?.templates || []).forEach((t, i) => add(t.key, Math.max(2, 12 - i * 2), `${phase.label}: ${t.why}`))
  if (WORDS.financing.test(text)) {
    add('financing', 14, 'the words are a financing offer')
    add('plan_card', 4)
  }
  if (WORDS.emergency.test(text)) add('emergency', 16, 'the words are an emergency or same-day call')
  if (WORDS.service.test(text)) {
    add('tune_up', 12, 'the words sell a tune-up or an inspection')
    add('coupon', 7, 'a service price clips out as a coupon')
    add('plan_card', 5)
  }
  if (WORDS.plan.test(text)) add('plan_card', 18, 'the words sell a plan or a membership')
  if (WORDS.free.test(text)) add('coupon', 5, 'a free offer reads as a coupon')
  if (WORDS.sale.test(text)) {
    add('massive_deal', 5, 'the words shout a sale')
    add('season_sale', 5, 'the words shout a sale')
  }
  if (WORDS.holiday.test(text) || phase?.season === 'holiday') add('holiday_deals', 9, 'it is the holidays')
  if (offers.length >= 2) {
    add('price_grid', 12, `${offers.length} prices want a grid`)
    add('stay_warm', 7, 'several prices fit the band')
    add('photo_sale', 5, 'several prices fit the band')
    add('before_sale', 3)
    add('fall_special', offers.length === 2 ? 4 : 0, 'two offers stack with OR between')
  }
  if (amount && /^\$?\s?\d[\d,]*(\.\d+)?\s?(off|%)?$/i.test(amount.replace(/\s+/g, ' '))) add('big_number', 7, 'the amount can carry the ad on its own')
  if (/%|\boff\b/i.test(amount) || /\boff\b/i.test(content.offerDetail || '')) add('big_number', 3)
  if (hasAfter) {
    add('before_sale', 16, 'there is a before and an after photo')
    add('reveal', 15, 'there is a before and an after photo')
  }
  if (WORDS.beforeAfter.test(text) && hasPhoto) {
    add('before_sale', 6, 'the words describe a transformation')
    add('reveal', 6, 'the words describe a transformation')
  }
  if (hasPhoto && !hasAfter) {
    add('photo_sale', 6, 'there is a photo to show')
    add('stay_warm', 5, 'there is a photo to show')
  }
  for (const k of PHOTO_TEMPLATES) {
    if (!hasPhoto) add(k, -30)
    if (TWO_PHOTO_TEMPLATES.includes(k) && !hasAfter) add(k, -20)
  }
  for (const k of exclude) add(k, -100)
  const ranked = TEMPLATE_KEYS.map((key) => ({ key, score: scores[key].score, why: scores[key].why })).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const reason = best.why.length ? best.why[best.why.length - 1] : phase ? `${phase.label}: the default` : 'the default'
  return { key: best.key, reason, ranked }
}

/**
 * The templates to put forward for the moment, in order, with a reason each:
 * the phase's ranking, minus the ones that need a photo nobody has picked.
 */
export function bestTemplates(phase, { hasPhoto = false, hasAfter = false, count = 4 } = {}) {
  const out = []
  for (const t of phase?.templates || []) {
    if (PHOTO_TEMPLATES.includes(t.key) && !hasPhoto) continue
    if (TWO_PHOTO_TEMPLATES.includes(t.key) && !hasAfter) continue
    out.push(t)
    if (out.length >= count) break
  }
  return out
}

/**
 * The playbook as a paragraph for the chat: what time of year it is for this
 * trade in this market, the tactics, the offers that fit, and what to leave
 * out. Carried in the client's brief and in the "Make 3 ads" ask.
 */
export function playbookText(phase, { tradeWords = 'home services', market = '' } = {}) {
  if (!phase) return ''
  const where = market.trim() ? ` in ${market.trim()}` : ''
  const lines = [
    `It is ${phase.month}: ${phase.label.toLowerCase()} for a ${tradeWords} company${where}. ${phase.summary}`,
    `Tactics now: ${phase.tactics.join(' ')}`,
  ]
  if (phase.offers.length) lines.push(`Offer shapes that fit now (use their real prices; these are shapes, not numbers to invent): ${phase.offers.join('; ')}.`)
  if (phase.avoid?.length) lines.push(`Leave out: ${phase.avoid.join('; ')}.`)
  if (phase.moments?.length) lines.push(`Coming up: ${phase.moments.map((x) => `${x.name} (${x.days <= 0 ? 'this week' : `in ${x.days} days`}): ${x.note}`).join('; ')}.`)
  return lines.join('\n')
}

/** The trade as words, for the prompts. */
export const TRADE_WORDS = {
  hvac: 'heating and cooling',
  hvac_plumbing: 'heating, cooling and plumbing',
  plumbing: 'plumbing',
  water: 'water treatment',
  roofing: 'roofing',
  electrical: 'electrical',
  washing: 'pressure washing',
  lawn: 'lawn and landscaping',
  pool: 'pool',
  pest: 'pest control',
  appliance: 'appliance repair',
  remodel: 'construction and remodeling',
  general: 'home services',
}
