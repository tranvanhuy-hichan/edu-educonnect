import assert from "node:assert/strict";
import { after,test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { deleteSharedAcademicYear } from "../src/modules/academic/calendar-management";
const enabled=process.env.RUN_DATABASE_TESTS==="1";
after(async()=>prisma.$disconnect());
class Rollback extends Error{}
test("shared calendar: deleting an unused Edu year removes Doan config; a used year cannot disappear",{skip:!enabled},async()=>{
  try{await prisma.$transaction(async tx=>{
    await tx.$executeRaw`UPDATE edu."SyncSetting" SET enabled=true WHERE id=1`;
    const start=2052;
    const year=await tx.academicYear.create({data:{schoolYear:start,yearName:`${start}-${start+1}`,startDate:new Date('2052-09-02T00:00:00Z'),endDate:new Date('2053-05-04T00:00:00Z'),terms:{create:[{termName:'HK1',startDate:new Date('2052-09-02T00:00:00Z'),endDate:new Date('2053-01-05T00:00:00Z')}]}}});
    assert.ok(await tx.doanSchoolYear.findUnique({where:{startYear:start}}));
    const grade=await tx.gradeLevel.findFirstOrThrow();
    const cls=await tx.schoolClass.create({data:{className:`10C${crypto.randomUUID()}`,gradeLevelId:grade.id,academicYearId:year.id}});
    await assert.rejects(deleteSharedAcademicYear(year.id,tx),/đã có lớp/);
    assert.ok(await tx.academicYear.findUnique({where:{id:year.id}}));assert.ok(await tx.doanSchoolYear.findUnique({where:{startYear:start}}));
    await tx.schoolClass.delete({where:{id:cls.id}});await deleteSharedAcademicYear(year.id,tx);
    assert.equal(await tx.academicYear.findUnique({where:{id:year.id}}),null);assert.equal(await tx.doanSchoolYear.findUnique({where:{startYear:start}}),null);
    throw new Rollback();
  },{timeout:30000});}catch(e){if(!(e instanceof Rollback))throw e;}
});
