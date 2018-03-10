let c = 0;
function count() {
    console.log("Counting...");
    document.getElementById("forjs").innerText = "The count is: " + (c++);
}
setInterval(count, 5000);