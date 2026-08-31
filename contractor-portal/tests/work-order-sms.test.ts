import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, canReceiveSms, isOffice, isSmsEvent, isUuid, normalizeUsPhone, twilioErrorMessage } from '../supabase/functions/send-work-order-sms/core.ts';
test('validates events and UUIDs',()=>{assert.equal(isSmsEvent('accepted'),true);assert.equal(isSmsEvent('anything'),false);assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'),true);});
test('authorizes roles and honors opt-outs',()=>{assert.equal(isOffice({is_admin:true}),true);assert.equal(isOffice({role:'contractor'}),false);assert.equal(canReceiveSms({is_active:true,sms_notifications_enabled:true,sms_opted_out_at:null}),true);assert.equal(canReceiveSms({is_active:true,sms_notifications_enabled:true,sms_opted_out_at:'now'}),false);});
test('builds scenario messages',()=>{assert.match(buildMessage('assigned','123','Admin',null),/Accept\/Reject/);assert.match(buildMessage('note_added','123','Jane',null),/job note was added/);assert.match(buildMessage('accepted','123','Jane',null),/Accepted by Jane/);assert.match(buildMessage('completed','123','Jane','2026-08-29T18:00:00Z'),/Completed by Jane/);});
test('normalizes phones and errors',()=>{assert.equal(normalizeUsPhone('(864) 555-1234'),'+18645551234');assert.equal(twilioErrorMessage({message:'Rejected'}),'Rejected');});
