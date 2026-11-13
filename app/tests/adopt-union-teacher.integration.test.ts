import assert from "node:assert/strict";
import { after,test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { adoptUnionTeacher } from "../src/modules/admin/adopt-union-teacher";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async()=>prisma.$disconnect());
class Rollback extends Error {}
test("adopt existing BCH as teacher idempotently while preserving locked status and credentials; matching pupils stay separate", {skip:!enabled}, async()=>{
  try { await prisma.$transaction(async tx=>{
    const name=`teacher-${crypto.randomUUID()}`;
    const a=await tx.doanUser.create({data:{username:name,fullName:name,passwordHash:"unchanged",role:"ADMIN",status:"LOCKED",position:"BCH"}});
    const first=await adoptUnionTeacher(tx,a.id);const second=await adoptUnionTeacher(tx,a.id);
    assert.equal(first.id,second.id);assert.equal(first.created,true);assert.equal(second.created,false);
    const u=await tx.user.findUniqueOrThrow({where:{id:first.id},include:{account:true,teacher:true}});
    assert.deepEqual(u.roles,["SUBJECT_TEACHER"]);assert.equal(u.isActive,false);assert.ok(u.teacher);
    assert.equal(u.account.passwordHash,"unchanged");assert.equal(u.account.status,"LOCKED");assert.equal(u.account.position,"BCH");
    const pupilAccount=await tx.doanUser.create({data:{username:`pupil-${crypto.randomUUID()}`,fullName:"Pupil Test",passwordHash:"pupil",role:"EXTERNAL"}});
    const pupil=await tx.user.create({data:{email:`${crypto.randomUUID()}@test.invalid`,roles:["STUDENT"],accountId:pupilAccount.id,student:{create:{fullName:"Pupil Test"}}}});
    const bch=await tx.doanUser.create({data:{username:`bch-${crypto.randomUUID()}`,fullName:"Pupil Test",passwordHash:"bch",role:"ADMIN"}});
    await assert.rejects(adoptUnionTeacher(tx,bch.id),/học sinh trùng/);
    assert.equal((await tx.user.findUniqueOrThrow({where:{id:pupil.id}})).accountId,pupilAccount.id);
    assert.equal(await tx.user.count({where:{accountId:bch.id}}),0);
    throw new Rollback();
  },{timeout:30000}); } catch(e){if(!(e instanceof Rollback))throw e;}
});
