import assert from "node:assert/strict";
import { after,test } from "node:test";
import { prisma } from "../src/lib/prisma";
import * as service from "../src/modules/admin/admin.service";
import * as repository from "../src/modules/admin/admin.repository";
const enabled=process.env.RUN_DATABASE_TESTS==="1";
after(async()=>prisma.$disconnect());
test("administrator roles cannot be edited through service or a direct repository call",{skip:!enabled},async()=>{
  const admin=await prisma.user.findFirstOrThrow({where:{roles:{has:"ADMIN"},isActive:true}});
  const actor={userId:admin.id,email:admin.email,roles:admin.roles,teacherId:null,studentId:null};
  await assert.rejects(service.updateUserRoles(actor,admin.id,{roles:["LIBRARIAN"]}),/Không được sửa quyền/);
  await assert.rejects(repository.updateUserRoles(admin.id,["LIBRARIAN"]),/Không được sửa quyền/);
  assert.deepEqual((await prisma.user.findUniqueOrThrow({where:{id:admin.id}})).roles,admin.roles);
});
