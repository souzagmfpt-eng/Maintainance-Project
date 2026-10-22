(function(){
  const button=document.getElementById('backToTop');
  if(!button)return;
  const updateVisibility=()=>button.classList.toggle('is-visible',window.scrollY>320);
  window.addEventListener('scroll',updateVisibility,{passive:true});
  window.addEventListener('resize',updateVisibility);
  button.addEventListener('click',()=>{
    const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top:0,behavior:reduceMotion?'auto':'smooth'});
  });
  updateVisibility();
})();
