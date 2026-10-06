(function(global){
  async function start(config,onRemoteStream){
    if(!config||!config.webrtcUrl)throw new Error("Realtime voice WebRTC URL missing");
    var local=await navigator.mediaDevices.getUserMedia({audio:true});
    var pc=new RTCPeerConnection();
    local.getTracks().forEach(function(track){pc.addTrack(track,local);});
    pc.ontrack=function(event){if(onRemoteStream&&event.streams&&event.streams[0])onRemoteStream(event.streams[0]);};

    var offer=await pc.createOffer();
    await pc.setLocalDescription(offer);

    var response=await fetch(config.webrtcUrl,{
      method:"POST",
      headers:{
        "content-type":"application/sdp",
        ...(config.ephemeralToken?{authorization:"Bearer "+config.ephemeralToken}:{})
      },
      body:offer.sdp
    });
    if(!response.ok){
      local.getTracks().forEach(function(track){track.stop();});
      pc.close();
      throw new Error("Realtime voice SDP negotiation failed: "+response.status);
    }

    var contentType=response.headers.get("content-type")||"";
    var answerSdp;
    if(contentType.indexOf("application/json")!==-1){
      var body=await response.json();
      answerSdp=body.sdp||body.answer||body.answer_sdp;
    }else{
      answerSdp=await response.text();
    }
    if(!answerSdp)throw new Error("Realtime voice provider returned no SDP answer");
    await pc.setRemoteDescription({type:"answer",sdp:answerSdp});

    return{
      pc:pc,
      localStream:local,
      stop:function(){
        local.getTracks().forEach(function(track){track.stop();});
        pc.getSenders().forEach(function(sender){if(sender.track)sender.track.stop();});
        pc.close();
      }
    };
  }
  global.JaneVoice={start:start};
})(window);
