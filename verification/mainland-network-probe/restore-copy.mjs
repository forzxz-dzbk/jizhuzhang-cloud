import {existsSync,unlinkSync} from 'node:fs'; const f=process.argv[2]; if(existsSync(f)) unlinkSync(f); console.log('RESTORED_ABSENT='+String(!existsSync(f)));
