export const scenarios={
 clear:{title:'Clear view with observed motion',count:214,direction:'East · image space',visibility:'Reference-like',issue:null},
 tracking:{title:'Tracking unavailable',count:null,direction:'Unreliable',visibility:'Unverified',issue:'Tracking unavailable'},
 visibility:{title:'Visibility degraded',count:null,direction:'Unavailable',visibility:'Degraded',issue:'Visibility degraded'},
 camera:{title:'Camera movement suspected',count:null,direction:'Suspended',visibility:'Unverified',issue:'Camera movement suspected'},
 congestion:{title:'Possible congestion',count:236,direction:'Mixed movement',visibility:'Reference-like',issue:'Possible congestion — verify'}
};
export const sampleSop={sop_id:'SOP-VERIFY-01',version:'0.1',title:'Verify camera and crowd assessment',approval_status:'Sample SOP — demonstration only',reactive:['Verify the current camera image.','Check for obstruction or camera movement.','Review another available view if assessment is unreliable.'],proactive:['Monitor whether the condition persists.','Prepare the incident evidence for the designated supervisor.'],escalation:['Follow the venue-approved escalation procedure if assessment remains unavailable.'],recovery:['Confirm usable evidence has returned; restored tracking alone does not establish crowd safety.']};
