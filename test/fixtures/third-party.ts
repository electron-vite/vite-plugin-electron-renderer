import { execa } from 'execa'
import serialport from 'serialport'

console.log('execa:', execa)
console.log('serialport:', serialport)

import('node-fetch')
  .then((m) => m.default)
  .then((fetch) => {
    console.log(fetch)
  })
